import { captureAgentObservation } from "./agent-observation"
import type { AgentObservation } from "./agent-observation-types"
import { PokemonApiClient } from "./api-client"
import { ControllerConflictError } from "./control-errors"
import { recordTraceObservation } from "./trace-recording"
import type { TraceWriter } from "./trace-writer"
import { BackendHttpError, KyJsonTransport } from "./transport"

const CONTROLLER_HEARTBEAT_INTERVAL_MS = 1000
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const

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
  readonly shutdownSignal?: Promise<void>
  readonly traceWriter?: TraceWriter
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
  shutdownSignal,
  traceWriter,
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
  const shutdown = createShutdownSignal(shutdownSignal)
  heartbeat.start()
  try {
    await shutdown.race(actor.start?.(actorContext) ?? Promise.resolve())
    let turn = 0
    while (!shutdown.requested && (maxTurns === undefined || turn < maxTurns)) {
      heartbeat.throwIfFailed()
      turn += 1
      await shutdown.race(
        onStatus?.({ message: "loading screen", type: "loading" }) ?? Promise.resolve(),
      )
      const observation = await shutdown.race(captureAgentObservation(client))
      await shutdown.race(recordTraceObservation(traceWriter, observation, turn, "beforeTurn"))
      await shutdown.race(onObservation?.(observation, turn) ?? Promise.resolve())
      const result = await shutdown.race(actor.runTurn({ ...actorContext, observation, turn }))
      switch (result.type) {
        case "continue":
          if (result.actionObservation !== undefined) {
            await shutdown.race(
              onActionObservation?.(result.actionObservation, turn) ?? Promise.resolve(),
            )
          }
          break
        case "quit":
          return
        default:
          assertNever(result)
      }
    }
  } catch (error) {
    if (!(error instanceof GracefulShutdownError)) {
      throw error
    }
  } finally {
    shutdown.dispose()
    heartbeat.stop()
    await actor.stop?.()
    await client.releaseController(controllerId)
  }
}

function createShutdownSignal(externalShutdown?: Promise<void>): {
  readonly dispose: () => void
  readonly race: <T>(promise: Promise<T>) => Promise<Awaited<T>>
  readonly requested: boolean
} {
  let requested = false
  let resolveShutdown: (() => void) | null = null
  const shutdown = new Promise<void>((resolve) => {
    resolveShutdown = resolve
  })
  const onSignal = (): void => {
    requested = true
    resolveShutdown?.()
  }
  externalShutdown?.then(onSignal).catch(() => {})
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, onSignal)
  }
  return {
    dispose: () => {
      for (const signal of SHUTDOWN_SIGNALS) {
        process.off(signal, onSignal)
      }
    },
    race: async <T>(promise: Promise<T>): Promise<Awaited<T>> => {
      const result: Awaited<T> | typeof SHUTDOWN_SENTINEL = await Promise.race([
        promise,
        shutdown.then<typeof SHUTDOWN_SENTINEL>(() => SHUTDOWN_SENTINEL),
      ])
      if (result === SHUTDOWN_SENTINEL) {
        throw new GracefulShutdownError()
      }
      return result
    },
    get requested() {
      return requested
    },
  }
}

const SHUTDOWN_SENTINEL: unique symbol = Symbol("shutdown")

class GracefulShutdownError extends Error {
  constructor() {
    super("shutdown requested")
    this.name = "GracefulShutdownError"
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
