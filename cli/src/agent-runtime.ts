import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { Agent, type AgentEvent, type AgentRun, type SessionHandle } from "@minpeter/pss-runtime"
import chalk from "chalk"
import { createDashboardEventForwarder } from "./agent-dashboard-events"
import { createObservedAgentInput } from "./agent-observation"
import type { AgentObservation } from "./agent-observation-types"
import {
  createPokemonControlPlane,
  describePokemonControlPlane,
  type PokemonControlPlaneTools,
} from "./agent-tools"
import type { PokemonApiClient } from "./api-client"
import { AgentRunError, ControllerConflictError } from "./control-errors"
import {
  type PokemonControlActor,
  type PokemonControlLoopStatus,
  type PokemonControlTurnContext,
  type PokemonControlTurnResult,
  runPokemonControlLoop,
} from "./pokemon-control-loop"

const DEFAULT_CONTROLLER_ID = "agent-cli"
const DEFAULT_SESSION_ID = "pokemon-agent"

export interface RunAgentControlPlaneOptions {
  readonly aiApiKey?: string
  readonly aiBaseUrl: string
  readonly backendUrl: string
  readonly client?: PokemonApiClient
  readonly controllerId?: string
  readonly maxTurns?: number
  readonly modelId: string
  readonly onEvent?: (event: AgentEvent) => void | Promise<void>
  readonly onActionObservation?: (
    observation: AgentObservation,
    turn: number,
  ) => void | Promise<void>
  readonly onObservation?: (observation: AgentObservation, turn: number) => void | Promise<void>
  readonly onStatus?: (status: AgentRuntimeStatus) => void | Promise<void>
  readonly sessionId?: string
}

export type AgentRuntimeStatus = PokemonControlLoopStatus

export interface StreamAgentEventsResult {
  readonly errorMessage?: string
  readonly ok: boolean
}

export class UnhandledAgentEventError extends Error {
  constructor(readonly value: never) {
    super(`unhandled agent event: ${JSON.stringify(value)}`)
    this.name = "UnhandledAgentEventError"
  }
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

export async function runAgentControlPlane({
  aiApiKey,
  aiBaseUrl,
  backendUrl,
  client: providedClient,
  controllerId = DEFAULT_CONTROLLER_ID,
  maxTurns,
  modelId,
  onActionObservation,
  onEvent = writeAgentEvent,
  onObservation,
  onStatus,
  sessionId = DEFAULT_SESSION_ID,
}: RunAgentControlPlaneOptions): Promise<void> {
  await runPokemonControlLoop({
    actor: createPssRuntimeActor({
      ...(aiApiKey === undefined ? {} : { aiApiKey }),
      aiBaseUrl,
      modelId,
      onEvent,
      sessionId,
    }),
    backendUrl,
    ...(providedClient === undefined ? {} : { client: providedClient }),
    controllerId,
    ...(maxTurns === undefined ? {} : { maxTurns }),
    ...(onActionObservation === undefined ? {} : { onActionObservation }),
    ...(onObservation === undefined ? {} : { onObservation }),
    ...(onStatus === undefined ? {} : { onStatus }),
  })
}

interface CreatePssRuntimeActorOptions {
  readonly aiApiKey?: string
  readonly aiBaseUrl: string
  readonly modelId: string
  readonly onEvent: (event: AgentEvent) => void | Promise<void>
  readonly sessionId: string
}

function createPssRuntimeActor({
  aiApiKey,
  aiBaseUrl,
  modelId,
  onEvent,
  sessionId,
}: CreatePssRuntimeActorOptions): PokemonControlActor {
  let session: SessionHandle | null = null
  const actionObservationQueue: AgentObservation[] = []
  return {
    runTurn: (context) =>
      runPssRuntimeTurn({
        actionObservationQueue,
        onEvent,
        session,
        ...context,
      }),
    start: async ({ client, controllerId, onStatus }) => {
      await onStatus?.({ message: "loading agent", type: "loading" })
      const provider = createOpenAICompatible({
        ...(aiApiKey === undefined ? {} : { apiKey: aiApiKey }),
        baseURL: aiBaseUrl,
        name: "pokemon-harness",
      })
      const agent = await Agent.create({
        instructions: buildAgentInstructions(),
        model: provider(modelId),
        toolChoice: "required",
        tools: createPokemonControlPlane({
          client,
          controllerId,
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
  session,
  turn,
}: PokemonControlTurnContext & {
  readonly actionObservationQueue: AgentObservation[]
  readonly onEvent: (event: AgentEvent) => void | Promise<void>
  readonly session: SessionHandle | null
}): Promise<PokemonControlTurnResult> {
  if (session === null) {
    throw new AgentRunError("agent session was not initialized")
  }
  await session.steer(
    createObservedAgentInput({
      observation,
      text: `Fresh Pokemon harness observation before turn ${turn}.`,
    }),
  )
  await onStatus?.({ message: "agent thinking", type: "loading" })
  let actionObservation: AgentObservation | undefined
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
  return actionObservation === undefined
    ? { type: "continue" }
    : { actionObservation, type: "continue" }
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

export function writeAgentEvent(event: AgentEvent): void {
  switch (event.type) {
    case "assistant-reasoning":
      return
    case "assistant-text":
      process.stdout.write(event.text)
      return
    case "runtime-input":
      process.stdout.write(`${chalk.cyan("OBSERVE")} ${event.placement}\n`)
      return
    case "tool-call":
      process.stdout.write(
        `${chalk.yellow("ACTION")} ${event.toolName} ${JSON.stringify(event.input)}\n`,
      )
      return
    case "tool-result":
      process.stdout.write(
        `${chalk.green("DONE")} ${event.toolName} ${JSON.stringify(event.output)}\n`,
      )
      return
    case "turn-error":
      process.stderr.write(`${chalk.red("ERROR")} ${event.message}\n`)
      return
    case "step-end":
    case "step-start":
    case "turn-abort":
    case "turn-end":
    case "turn-start":
    case "user-message":
    case "user-text":
      return
    default:
      assertNever(event)
  }
}

function assertNever(value: never): never {
  throw new UnhandledAgentEventError(value)
}

export {
  AgentRunError,
  ControllerConflictError,
  createDashboardEventForwarder,
  createPokemonControlPlane,
}
