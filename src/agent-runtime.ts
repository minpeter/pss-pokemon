import type { AgentEvent, RuntimeLlm } from "@minpeter/pss-runtime"
import chalk from "chalk"
import { createDashboardEventForwarder } from "./agent-dashboard-events"
import type { PokemonAgentMemory } from "./agent-memory"
import {
  createFilePokemonAgentMemory,
  defaultPokemonMemoryRootDir,
} from "./agent-memory-file-store"
import type { AgentObservation } from "./agent-observation-types"
import { createPokemonControlPlane } from "./agent-tools"
import type { PokemonApiClient } from "./api-client"
import { AgentRunError, ControllerConflictError } from "./control-errors"
import { type PokemonControlLoopStatus, runPokemonControlLoop } from "./pokemon-control-loop"
import { buildAgentInstructions, createProviderAgentSettings } from "./pss-agent-settings"
import { createPssRuntimeActor, streamAgentEvents } from "./pss-runtime-actor"
import type { TraceWriter } from "./trace-writer"

const DEFAULT_CONTROLLER_ID = "agent-cli"
const DEFAULT_SESSION_ID = "pokemon-agent"

export interface RunAgentControlPlaneOptions {
  readonly aiApiKey?: string
  readonly aiBaseUrl: string
  readonly backendUrl: string
  readonly client?: PokemonApiClient
  readonly controllerId?: string
  readonly maxTurns?: number
  readonly llm?: RuntimeLlm
  readonly memory?: PokemonAgentMemory
  readonly memoryRootDir?: string
  readonly modelId: string
  readonly onEvent?: (event: AgentEvent) => void | Promise<void>
  readonly onActionObservation?: (
    observation: AgentObservation,
    turn: number,
  ) => void | Promise<void>
  readonly onObservation?: (observation: AgentObservation, turn: number) => void | Promise<void>
  readonly onStatus?: (status: AgentRuntimeStatus) => void | Promise<void>
  readonly sessionId?: string
  readonly traceWriter?: TraceWriter
}

export type AgentRuntimeStatus = PokemonControlLoopStatus

export class UnhandledAgentEventError extends Error {
  constructor(readonly value: never) {
    super(`unhandled agent event: ${JSON.stringify(value)}`)
    this.name = "UnhandledAgentEventError"
  }
}

export async function runAgentControlPlane({
  aiApiKey,
  aiBaseUrl,
  backendUrl,
  client: providedClient,
  controllerId = DEFAULT_CONTROLLER_ID,
  llm,
  memory,
  memoryRootDir,
  maxTurns,
  modelId,
  onActionObservation,
  onEvent = writeAgentEvent,
  onObservation,
  onStatus,
  sessionId = DEFAULT_SESSION_ID,
  traceWriter,
}: RunAgentControlPlaneOptions): Promise<void> {
  const resolvedMemory =
    memory ??
    (await createFilePokemonAgentMemory({
      rootDir: memoryRootDir ?? defaultPokemonMemoryRootDir(),
      sessionId,
    }))
  await runPokemonControlLoop({
    actor: createPssRuntimeActor({
      ...(aiApiKey === undefined ? {} : { aiApiKey }),
      aiBaseUrl,
      ...(llm === undefined ? {} : { llm }),
      memory: resolvedMemory,
      modelId,
      onEvent,
      sessionId,
      ...(traceWriter === undefined ? {} : { traceWriter }),
    }),
    backendUrl,
    ...(providedClient === undefined ? {} : { client: providedClient }),
    controllerId,
    ...(maxTurns === undefined ? {} : { maxTurns }),
    ...(onActionObservation === undefined ? {} : { onActionObservation }),
    ...(onObservation === undefined ? {} : { onObservation }),
    ...(onStatus === undefined ? {} : { onStatus }),
    ...(traceWriter === undefined ? {} : { traceWriter }),
  })
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
  buildAgentInstructions,
  ControllerConflictError,
  createDashboardEventForwarder,
  createPokemonControlPlane,
  createProviderAgentSettings,
  streamAgentEvents,
}
