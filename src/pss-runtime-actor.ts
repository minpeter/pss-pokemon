import {
  Agent,
  type AgentEvent,
  type AgentRun,
  type RuntimeLlm,
  type SessionHandle,
} from "@minpeter/pss-runtime"
import { createDashboardEventForwarder } from "./agent-dashboard-events"
import type { PokemonAgentMemory } from "./agent-memory"
import { createObservedAgentInput } from "./agent-observation"
import type { AgentObservation } from "./agent-observation-types"
import { createPokemonControlPlane, type PokemonControlPlaneTools } from "./agent-tools"
import { AgentRunError } from "./control-errors"
import type {
  PokemonControlActor,
  PokemonControlTurnContext,
  PokemonControlTurnResult,
} from "./pokemon-control-loop"
import { createProviderAgentSettings, createTurnPrompt } from "./pss-agent-settings"
import { recordTraceActionExecution } from "./trace-recording"
import type { TraceWriter } from "./trace-writer"

export interface CreatePssRuntimeActorOptions {
  readonly aiApiKey?: string
  readonly aiBaseUrl: string
  readonly llm?: RuntimeLlm
  readonly memory?: PokemonAgentMemory
  readonly modelId: string
  readonly onEvent: (event: AgentEvent) => void | Promise<void>
  readonly sessionId: string
  readonly traceWriter?: TraceWriter
}

export interface StreamAgentEventsResult {
  readonly errorMessage?: string
  readonly ok: boolean
}

export function createPssRuntimeActor({
  aiApiKey,
  aiBaseUrl,
  llm,
  memory,
  modelId,
  onEvent,
  sessionId,
  traceWriter,
}: CreatePssRuntimeActorOptions): PokemonControlActor {
  let session: SessionHandle | null = null
  const actionObservationQueue: AgentObservation[] = []
  const pendingTurn = new PendingAgentTurnObservation()
  return {
    runTurn: (context) =>
      runPssRuntimeTurn({
        actionObservationQueue,
        onEvent,
        pendingTurn,
        session,
        ...context,
      }),
    start: async ({ client, controllerId, onStatus }) => {
      await onStatus?.({ message: "loading agent", type: "loading" })
      if (llm !== undefined) {
        const agent = await Agent.create({
          hooks: createFreshObservationHooks({ memory, pendingTurn, session: () => session }),
          llm,
        })
        await onStatus?.({ type: "idle" })
        session = agent.session(sessionId)
        return
      }
      const agent = await Agent.create({
        hooks: createFreshObservationHooks({ memory, pendingTurn, session: () => session }),
        ...createProviderAgentSettings({
          ...(aiApiKey === undefined ? {} : { aiApiKey }),
          aiBaseUrl,
          modelId,
        }),
        tools: createPokemonControlPlane({
          client,
          controllerId,
          onBeforeAction: () => {
            pendingTurn.claimAction()
          },
          onActionExecution: async (execution) => {
            const pending = pendingTurn.require()
            await memory?.recordAction(execution, pending.turn)
            await recordTraceActionExecution(traceWriter, execution, pending.turn, "agent")
          },
          onActionObservation: (observation) => {
            actionObservationQueue.push(observation)
          },
        }) satisfies PokemonControlPlaneTools,
      })
      await onStatus?.({ type: "idle" })
      session = agent.session(sessionId)
    },
  }
}

async function runPssRuntimeTurn({
  actionObservationQueue,
  client,
  onEvent,
  onStatus,
  observation,
  pendingTurn,
  session,
  turn,
}: PokemonControlTurnContext & {
  readonly actionObservationQueue: AgentObservation[]
  readonly onEvent: (event: AgentEvent) => void | Promise<void>
  readonly pendingTurn: PendingAgentTurnObservation
  readonly session: SessionHandle | null
}): Promise<PokemonControlTurnResult> {
  if (session === null) {
    throw new AgentRunError("agent session was not initialized")
  }
  await onStatus?.({ message: "agent thinking", type: "loading" })
  let actionObservation: AgentObservation | undefined
  pendingTurn.set({ observation, turn })
  try {
    const run = await session.send(createTurnPrompt(turn))
    const result = await streamAgentEvents(
      run,
      createDashboardEventForwarder(client, async (event) => {
        await onEvent(event)
        if (event.type !== "tool-result") {
          return
        }
        const nextObservation = actionObservationQueue.shift()
        if (nextObservation !== undefined) {
          actionObservation = nextObservation
        }
        session.interrupt()
      }),
    )
    if (!result.ok) {
      throw new AgentRunError(result.errorMessage ?? "unknown turn error")
    }
  } finally {
    pendingTurn.clear()
  }
  return actionObservation === undefined
    ? { type: "continue" }
    : { actionObservation, type: "continue" }
}

function createFreshObservationHooks({
  memory,
  pendingTurn,
  session,
}: {
  readonly memory: PokemonAgentMemory | undefined
  readonly pendingTurn: PendingAgentTurnObservation
  readonly session: () => SessionHandle | null
}) {
  return {
    beforeTurn: async () => {
      const activeSession = session()
      if (activeSession === null) {
        throw new AgentRunError("agent session was not initialized")
      }
      const pending = pendingTurn.require()
      await activeSession.steer(
        createObservedAgentInput({
          ...(memory === undefined
            ? {}
            : { memoryContext: memory.renderContext(pending.observation) }),
          observation: pending.observation,
          text: `Fresh Pokemon harness observation before turn ${pending.turn}.`,
        }),
      )
    },
  }
}

interface PendingAgentTurn {
  readonly actionClaimed: boolean
  readonly observation: AgentObservation
  readonly turn: number
}

class PendingAgentTurnObservation {
  #value: PendingAgentTurn | null = null

  clear(): void {
    this.#value = null
  }

  claimAction(): void {
    const value = this.require()
    if (value.actionClaimed) {
      throw new AgentRunError("agent turn already executed an action")
    }
    this.#value = { ...value, actionClaimed: true }
  }

  require(): PendingAgentTurn {
    if (this.#value === null) {
      throw new AgentRunError("agent turn observation was not prepared")
    }
    return this.#value
  }

  set(value: { readonly observation: AgentObservation; readonly turn: number }): void {
    this.#value = { ...value, actionClaimed: false }
  }
}

export async function streamAgentEvents(
  run: Pick<AgentRun, "events">,
  onEvent: (event: AgentEvent) => void | Promise<void>,
): Promise<StreamAgentEventsResult> {
  let errorMessage: string | undefined

  for await (const event of run.events()) {
    await onEvent(event)
    if (event.type === "turn-error") {
      errorMessage = event.message
    }
  }

  return errorMessage === undefined ? { ok: true } : { errorMessage, ok: false }
}
