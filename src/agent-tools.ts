import { type ToolSet, tool } from "ai"
import { z } from "zod"
import type { AgentObservation } from "./agent-observation-types"
import { PokemonApiClient } from "./api-client"
import {
  type ActionVerification,
  executePokemonAction,
  formatPlayerTile,
  type PokemonActionExecution,
} from "./pokemon-action-executor"
import type { ActionRequest } from "./schemas"
import { type JsonTransport, KyJsonTransport } from "./transport"

const AGENT_CONTROLLER_ID = "agent-cli"
const DEFAULT_BACKEND_URL = "http://127.0.0.1:8765"
const WAIT_BUTTON_FRAMES = 120

const EmulatorButtonSchema = z.enum([
  "a",
  "b",
  "up",
  "down",
  "left",
  "right",
  "start",
  "select",
  "wait",
])

export const UseEmulatorInputSchema = z.object({
  buttons: z
    .array(EmulatorButtonSchema)
    .min(1)
    .max(32)
    .describe("The buttons to press in sequence."),
})

type EmulatorButton = z.infer<typeof EmulatorButtonSchema>
type UseEmulatorInput = z.infer<typeof UseEmulatorInputSchema>
type ActionStep = ActionRequest["sequence"][number]

export type ActionObservationHandler = (observation: AgentObservation) => void | Promise<void>
export type ActionExecutionHandler = (execution: PokemonActionExecution) => void | Promise<void>
export type BeforeActionHandler = (action: ActionRequest) => void | Promise<void>

export interface ActionToolOutput {
  readonly buttons: readonly EmulatorButton[]
  readonly frameAfter: number
  readonly frameBefore: number
  readonly map: string
  readonly ok: true
  readonly passableDirections: readonly string[]
  readonly playerTile: string
  readonly verification: ActionVerification
}

export interface CreatePokemonControlPlaneOptions {
  readonly backendUrl?: string
  readonly client?: PokemonApiClient
  readonly controllerId?: string
  readonly onBeforeAction?: BeforeActionHandler
  readonly onActionExecution?: ActionExecutionHandler
  readonly onActionObservation?: ActionObservationHandler
  readonly transport?: JsonTransport
}

export function createPokemonControlPlane({
  backendUrl = DEFAULT_BACKEND_URL,
  client,
  controllerId = AGENT_CONTROLLER_ID,
  onBeforeAction,
  onActionExecution,
  onActionObservation,
  transport,
}: CreatePokemonControlPlaneOptions = {}) {
  const resolvedClient =
    client ?? new PokemonApiClient(transport ?? new KyJsonTransport(backendUrl))
  const sendAction = (action: ActionRequest) =>
    sendVerifiedAction({
      action,
      client: resolvedClient,
      onBeforeAction,
      onActionExecution,
      onActionObservation,
    })

  return {
    use_emulator: tool({
      description:
        "Execute a sequence of button presses in the emulator. This is the primary tool you have to interact with the game. To use the emulator, you'll provide a list of buttons which will be pressed in sequence. Valid buttons are 'a', 'b', 'up', 'down', 'left', 'right', 'start', and 'select'. Additionally, you can provide the button 'wait' to let two seconds of frames go by.",
      inputSchema: UseEmulatorInputSchema,
      execute: async ({ buttons }) => {
        const execution = await sendAction(
          createUseEmulatorActionRequest({ buttons, controllerId }),
        )
        return { ...baseActionToolOutput(execution), buttons }
      },
    }),
  } satisfies ToolSet
}

export type PokemonControlPlaneTools = ReturnType<typeof createPokemonControlPlane>

export function describePokemonControlPlane(): string {
  return [
    "You can control the already-running Pokemon game with one action-only emulator tool.",
    "Available tool: use_emulator.",
    "use_emulator executes a buttons array in order. Valid buttons are 'a', 'b', 'up', 'down', 'left', 'right', 'start', 'select', and 'wait'.",
    "'wait' advances two seconds of emulator frames.",
    "Reset, load, save, ROM loading, and save-state controls are intentionally not exposed.",
  ].join("\n")
}

function createUseEmulatorActionRequest({
  buttons,
  controllerId,
}: UseEmulatorInput & { readonly controllerId: string }): ActionRequest {
  return {
    controllerId,
    sequence: buttons.map(emulatorButtonToStep),
  }
}

function emulatorButtonToStep(button: EmulatorButton): ActionStep {
  switch (button) {
    case "wait":
      return { frames: WAIT_BUTTON_FRAMES, type: "wait" }
    case "a":
    case "b":
    case "up":
    case "down":
    case "left":
    case "right":
    case "start":
    case "select":
      return { button, type: "button" }
    default:
      return assertNever(button)
  }
}

function baseActionToolOutput(
  execution: PokemonActionExecution,
): Omit<ActionToolOutput, "buttons"> {
  return {
    frameAfter: execution.response.frameAfter,
    frameBefore: execution.response.frameBefore,
    map: execution.response.observation.state.map.name ?? "unknown",
    ok: true,
    passableDirections: execution.response.observation.state.collision.passableDirections,
    playerTile: formatPlayerTile(execution.response.observation),
    verification: execution.verification,
  }
}

async function sendVerifiedAction({
  action,
  client,
  onActionExecution,
  onActionObservation,
  onBeforeAction,
}: {
  readonly action: ActionRequest
  readonly client: PokemonApiClient
  readonly onBeforeAction: BeforeActionHandler | undefined
  readonly onActionExecution: ActionExecutionHandler | undefined
  readonly onActionObservation: ActionObservationHandler | undefined
}): Promise<PokemonActionExecution> {
  if (onBeforeAction !== undefined) {
    await onBeforeAction(action)
  }
  const execution = await executePokemonAction({ action, client })
  if (onActionExecution !== undefined) {
    await onActionExecution(execution)
  }
  if (onActionObservation !== undefined) {
    await onActionObservation(execution.observation)
  }
  return execution
}

function assertNever(value: never): never {
  throw new UnhandledEmulatorButtonError(value)
}

class UnhandledEmulatorButtonError extends Error {
  constructor(readonly value: never) {
    super(`unhandled emulator button: ${JSON.stringify(value)}`)
    this.name = "UnhandledEmulatorButtonError"
  }
}
