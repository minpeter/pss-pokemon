import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
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
import {
  createPokemonControlPlane,
  describePokemonControlPlane,
  type PokemonControlPlaneTools,
} from "./agent-tools"
import { AgentRunError } from "./control-errors"
import type {
  PokemonControlActor,
  PokemonControlTurnContext,
  PokemonControlTurnResult,
} from "./pokemon-control-loop"

export interface CreatePssRuntimeActorOptions {
  readonly aiApiKey?: string
  readonly aiBaseUrl: string
  readonly llm?: RuntimeLlm
  readonly memory?: PokemonAgentMemory
  readonly modelId: string
  readonly onEvent: (event: AgentEvent) => void | Promise<void>
  readonly sessionId: string
}

export interface StreamAgentEventsResult {
  readonly errorMessage?: string
  readonly ok: boolean
}

export function buildAgentInstructions(): string {
  return [
    "You are a concise Pokemon-playing control agent for an already-loaded Pokemon game.",
    describePokemonControlPlane(),
    "Do not reset, reload, save, or load the game. Continue from the current backend state.",
    "Use a loop of observation -> short plan -> exactly one action tool -> brief summary.",
    "Before calling a tool, output one <action_plan> block with goal, visible state, chosen action, and why it should make progress.",
    "If dialog is active, use use_emulator with a short sequence of 'a' and 'wait' buttons.",
    "If battle is active, pick a battle/menu action instead of wandering.",
    "Use the ASCII collision map first: the player is E5, . is walkable, # is blocked.",
    "Use use_emulator buttons for all emulator control.",
    "After each tool result, inspect verification.moved, verification.dialogChanged, verification.battleChanged, and verification.stateChanged before choosing the next action.",
    "Your <action_plan>, tool decisions, and tool verification summaries are mirrored to the dashboard stream each turn.",
    "Memory context is secondary to the fresh live state. Use it to avoid repeated failed routes, but ignore stale memory when it conflicts with the current observation.",
    "Avoid repeating an action if the latest observation and verification summary did not show progress.",
  ].join("\n\n")
}

export function createTurnPrompt(turn: number): string {
  return [
    `Autonomous Pokemon control turn ${turn}.`,
    "Use the injected observation and screenshot to choose the next single backend action.",
    "Do not stop unless interrupted by the operator.",
  ].join("\n")
}

export function createPssRuntimeActor({
  aiApiKey,
  aiBaseUrl,
  llm,
  memory,
  modelId,
  onEvent,
  sessionId,
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
      const provider = createOpenAICompatible({
        ...(aiApiKey === undefined ? {} : { apiKey: aiApiKey }),
        baseURL: aiBaseUrl,
        name: "pokemon-harness",
      })
      const agent = await Agent.create({
        hooks: createFreshObservationHooks({ memory, pendingTurn, session: () => session }),
        instructions: buildAgentInstructions(),
        model: provider(modelId),
        toolChoice: "required",
        tools: createPokemonControlPlane({
          client,
          controllerId,
          onActionExecution: async (execution) => {
            const pending = pendingTurn.require()
            await memory?.recordAction(execution, pending.turn)
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

class PendingAgentTurnObservation {
  #value: { readonly observation: AgentObservation; readonly turn: number } | null = null

  clear(): void {
    this.#value = null
  }

  require(): { readonly observation: AgentObservation; readonly turn: number } {
    if (this.#value === null) {
      throw new AgentRunError("agent turn observation was not prepared")
    }
    return this.#value
  }

  set(value: { readonly observation: AgentObservation; readonly turn: number }): void {
    this.#value = value
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
