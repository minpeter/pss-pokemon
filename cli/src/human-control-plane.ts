import { input as promptInput, select } from "@inquirer/prompts"
import type { AgentObservation } from "./agent-observation-types"
import { AgentTerminalView } from "./agent-terminal-view"
import type { PokemonApiClient } from "./api-client"
import { HUMAN_CONTROLLER_ID } from "./control-modes"
import { actionForKey } from "./keymap"
import { executePokemonAction } from "./pokemon-action-executor"
import {
  type PokemonControlActor,
  type PokemonControlTurnContext,
  type PokemonControlTurnResult,
  runPokemonControlLoop,
} from "./pokemon-control-loop"
import type { ActionRequest, ResetMode } from "./schemas"

type HumanDecision =
  | {
      readonly action: ActionRequest
      readonly type: "action"
    }
  | {
      readonly type: "continue"
    }
  | {
      readonly type: "quit"
    }

export interface HumanKeyInput {
  readonly isTTY?: boolean
  off(event: "data", listener: (chunk: string | Uint8Array) => void): void
  on(event: "data", listener: (chunk: string | Uint8Array) => void): void
  pause(): void
  resume(): void
  setEncoding(encoding: BufferEncoding): void
  setRawMode?(mode: boolean): void
}

export interface HumanControlView {
  showActionObservation(observation: AgentObservation, turn: number): Promise<void>
  showObservation(observation: AgentObservation, turn: number): Promise<void>
}

export interface RunHumanControlPlaneOptions {
  readonly backendUrl: string
  readonly client?: PokemonApiClient
  readonly controllerId?: string
  readonly input?: HumanKeyInput
  readonly maxTurns?: number
  readonly view?: HumanControlView
}

export async function runHumanControlPlane({
  backendUrl,
  client: providedClient,
  controllerId = HUMAN_CONTROLLER_ID,
  input = process.stdin,
  maxTurns,
  view = new AgentTerminalView(),
}: RunHumanControlPlaneOptions): Promise<void> {
  await runPokemonControlLoop({
    actor: createHumanKeyboardActor(input),
    backendUrl,
    ...(providedClient === undefined ? {} : { client: providedClient }),
    controllerId,
    ...(maxTurns === undefined ? {} : { maxTurns }),
    onActionObservation: async (observation, turn) => {
      await view.showActionObservation(observation, turn)
    },
    onObservation: async (observation, turn) => {
      await view.showObservation(observation, turn)
    },
  })
}

function createHumanKeyboardActor(input: HumanKeyInput): PokemonControlActor {
  return {
    runTurn: async (context) => executeHumanTurn({ input, ...context }),
    start: () => {
      prepareInput(input)
      return Promise.resolve()
    },
    stop: () => {
      restoreInput(input)
      return Promise.resolve()
    },
  }
}

async function executeHumanTurn({
  client,
  controllerId,
  input,
}: PokemonControlTurnContext & {
  readonly input: HumanKeyInput
}): Promise<PokemonControlTurnResult> {
  const decision = await readHumanDecision({ client, controllerId, input })
  switch (decision.type) {
    case "action": {
      const execution = await executePokemonAction({ action: decision.action, client })
      return { actionObservation: execution.observation, type: "continue" }
    }
    case "continue":
      return { type: "continue" }
    case "quit":
      return { type: "quit" }
    default:
      return assertNever(decision)
  }
}

async function readHumanDecision({
  client,
  controllerId,
  input,
}: {
  readonly client: PokemonApiClient
  readonly controllerId: string
  readonly input: HumanKeyInput
}): Promise<HumanDecision> {
  return new Promise((resolve, reject) => {
    const listener = (chunk: string | Uint8Array): void => {
      input.off("data", listener)
      void resolveHumanDecision({ chunk, client, controllerId, input }).then(resolve, reject)
    }
    input.on("data", listener)
  })
}

async function resolveHumanDecision({
  chunk,
  client,
  controllerId,
  input,
}: {
  readonly chunk: string | Uint8Array
  readonly client: PokemonApiClient
  readonly controllerId: string
  readonly input: HumanKeyInput
}): Promise<HumanDecision> {
  const key = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")
  if (key === "q") {
    return { type: "quit" }
  }
  if (key === "m") {
    return openMenu({ client, input })
  }
  const action = actionForKey(key, controllerId)
  return action === null ? { type: "continue" } : { action, type: "action" }
}

async function openMenu({
  client,
  input,
}: {
  readonly client: PokemonApiClient
  readonly input: HumanKeyInput
}): Promise<HumanDecision> {
  setRawMode(input, false)
  const choice = await select({
    choices: [
      { name: "Resume", value: "resume" },
      { name: "Save", value: "save" },
      { name: "Load", value: "load" },
      { name: "Reset to initial save-state", value: "initial_save_state" },
      { name: "Quit", value: "quit" },
    ],
    message: "Menu",
  })
  switch (choice) {
    case "resume":
      setRawMode(input, true)
      return { type: "continue" }
    case "save": {
      const name = await promptInput({ default: "qa-smoke", message: "Save name" })
      await client.save(name, false)
      setRawMode(input, true)
      return { type: "continue" }
    }
    case "load": {
      const name = await promptInput({ default: "qa-smoke", message: "Save name" })
      await client.load(name)
      setRawMode(input, true)
      return { type: "continue" }
    }
    case "initial_save_state":
      await client.reset(choice satisfies ResetMode)
      setRawMode(input, true)
      return { type: "continue" }
    case "quit":
      return { type: "quit" }
    default:
      return assertNever(choice)
  }
}

function prepareInput(input: HumanKeyInput): void {
  setRawMode(input, true)
  input.resume()
  input.setEncoding("utf8")
}

function restoreInput(input: HumanKeyInput): void {
  setRawMode(input, false)
  input.pause()
}

function setRawMode(input: HumanKeyInput, enabled: boolean): void {
  if (input.isTTY !== false) {
    input.setRawMode?.(enabled)
  }
}

function assertNever(value: never): never {
  throw new UnhandledHumanControlPlaneValueError(value)
}

class UnhandledHumanControlPlaneValueError extends Error {
  constructor(readonly value: never) {
    super(`unhandled human control plane value: ${JSON.stringify(value)}`)
    this.name = "UnhandledHumanControlPlaneValueError"
  }
}
