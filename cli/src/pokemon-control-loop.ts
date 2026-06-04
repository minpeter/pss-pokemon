import { captureAgentObservation } from "./agent-observation"
import type { AgentObservation } from "./agent-observation-types"
import { PokemonApiClient } from "./api-client"
import { ControllerConflictError } from "./control-errors"
import { BackendHttpError, KyJsonTransport } from "./transport"

const CONTROLLER_HEARTBEAT_INTERVAL_MS = 1000

export type PokemonControlLoopStatus =
  | {
      readonly message: string
      readonly type: "loading"
    }
  | {
      readonly type: "idle"
    }

export interface PokemonControlActor {
  runTurn(context: PokemonControlTurnContext): Promise<PokemonControlTurnResult>
  start?(context: PokemonControlActorContext): Promise<void>
  stop?(): Promise<void>
}

export interface PokemonControlActorContext {
  readonly client: PokemonApiClient
  readonly controllerId: string
  readonly onStatus?: (status: PokemonControlLoopStatus) => void | Promise<void>
}

export interface PokemonControlTurnContext extends PokemonControlActorContext {
  readonly observation: AgentObservation
  readonly turn: number
}

export type PokemonControlTurnResult =
  | {
      readonly actionObservation?: AgentObservation
      readonly type: "continue"
    }
  | {
      readonly type: "quit"
    }

export interface RunPokemonControlLoopOptions {
  readonly actor: PokemonControlActor
  readonly backendUrl: string
  readonly client?: PokemonApiClient
  readonly controllerId: string
  readonly maxTurns?: number
  readonly onActionObservation?: (
    observation: AgentObservation,
    turn: number,
  ) => void | Promise<void>
  readonly onObservation?: (observation: AgentObservation, turn: number) => void | Promise<void>
  readonly onStatus?: (status: PokemonControlLoopStatus) => void | Promise<void>
}

export async function runPokemonControlLoop({
  actor,
  backendUrl,
  client: providedClient,
  controllerId,
  maxTurns,
  onActionObservation,
  onObservation,
  onStatus,
}: RunPokemonControlLoopOptions): Promise<void> {
  const client = providedClient ?? new PokemonApiClient(new KyJsonTransport(backendUrl))
  await claimControllerLease({ client, controllerId })

  const actorContext = {
    client,
    controllerId,
    ...(onStatus === undefined ? {} : { onStatus }),
  }
  const heartbeat = new ControllerHeartbeat({
    client,
    controllerId,
    intervalMs: CONTROLLER_HEARTBEAT_INTERVAL_MS,
  })
  heartbeat.start()
  try {
    await actor.start?.(actorContext)
    let turn = 0
    while (maxTurns === undefined || turn < maxTurns) {
      heartbeat.throwIfFailed()
      turn += 1
      await onStatus?.({ message: "loading screen", type: "loading" })
      const observation = await captureAgentObservation(client)
      await onObservation?.(observation, turn)
      const result = await actor.runTurn({ ...actorContext, observation, turn })
      switch (result.type) {
        case "continue":
          if (result.actionObservation !== undefined) {
            await onActionObservation?.(result.actionObservation, turn)
          }
          break
        case "quit":
          return
        default:
          assertNever(result)
      }
    }
  } finally {
    heartbeat.stop()
    await actor.stop?.()
    await client.releaseController(controllerId)
  }
}

async function claimControllerLease({
  client,
  controllerId,
}: {
  readonly client: PokemonApiClient
  readonly controllerId: string
}): Promise<void> {
  const health = await client.health()
  if (health.activeControllerId !== null && health.activeControllerId !== controllerId) {
    throw new ControllerConflictError(health.activeControllerId, controllerId)
  }
  try {
    await client.heartbeat(controllerId)
  } catch (error) {
    if (error instanceof BackendHttpError && error.status === 409) {
      const activeHealth = await client.health()
      throw new ControllerConflictError(activeHealth.activeControllerId ?? "unknown", controllerId)
    }
    throw error
  }
}

class ControllerHeartbeat {
  readonly #client: PokemonApiClient
  readonly #controllerId: string
  readonly #intervalMs: number
  #lastError: Error | null = null
  #timer: ReturnType<typeof setInterval> | null = null

  constructor({
    client,
    controllerId,
    intervalMs,
  }: {
    readonly client: PokemonApiClient
    readonly controllerId: string
    readonly intervalMs: number
  }) {
    this.#client = client
    this.#controllerId = controllerId
    this.#intervalMs = intervalMs
  }

  start(): void {
    this.stop()
    this.#timer = setInterval(() => {
      void this.#send()
    }, this.#intervalMs)
  }

  stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer)
      this.#timer = null
    }
  }

  throwIfFailed(): void {
    if (this.#lastError !== null) {
      throw new ControllerHeartbeatError(this.#lastError)
    }
  }

  async #send(): Promise<void> {
    try {
      await this.#client.heartbeat(this.#controllerId)
    } catch (error) {
      this.#lastError = error instanceof Error ? error : new NonErrorHeartbeatRejectionError(error)
    }
  }
}

class ControllerHeartbeatError extends Error {
  constructor(readonly heartbeatError: Error) {
    super(`controller heartbeat failed: ${heartbeatError.message}`, { cause: heartbeatError })
    this.name = "ControllerHeartbeatError"
  }
}

class NonErrorHeartbeatRejectionError extends Error {
  constructor(readonly value: unknown) {
    super(`controller heartbeat rejected with non-Error value: ${JSON.stringify(value)}`)
    this.name = "NonErrorHeartbeatRejectionError"
  }
}

function assertNever(value: never): never {
  throw new UnhandledPokemonControlLoopValueError(value)
}

class UnhandledPokemonControlLoopValueError extends Error {
  constructor(readonly value: never) {
    super(`unhandled pokemon control loop value: ${JSON.stringify(value)}`)
    this.name = "UnhandledPokemonControlLoopValueError"
  }
}
