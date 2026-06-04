import {
  EMPTY_MEMORY_PROJECTION,
  type MovementAttemptMemory,
  type MovementDirection,
  type PokemonAgentMemory,
  type PokemonAgentMemoryRecorder,
  type PokemonMemoryProjection,
  PokemonMemoryProjectionSchema,
  type TilePosition,
} from "./agent-memory-model"
import type { AgentObservation } from "./agent-observation-types"
import type { PokemonActionExecution } from "./pokemon-action-executor"
import type { ActionRequest } from "./schemas"

const MAX_RECENT_ACTIONS = 8
const RECENT_ACTION_LINES = 4
const STUCK_FAILURE_THRESHOLD = 3
const CURRENT_OBJECTIVE = "Deliver Oak's Parcel and get Pokedex"

export {
  EMPTY_MEMORY_PROJECTION,
  type MovementAttemptMemory,
  type PokemonAgentMemory,
  type PokemonAgentMemoryRecord,
  type PokemonAgentMemoryRecorder,
  type PokemonMemoryProjection,
  PokemonMemoryProjectionSchema,
  type RecentActionMemory,
} from "./agent-memory-model"

export function createInMemoryPokemonAgentMemory(
  initialProjection: PokemonMemoryProjection = EMPTY_MEMORY_PROJECTION,
  onRecord?: PokemonAgentMemoryRecorder,
): PokemonAgentMemory {
  let projection = PokemonMemoryProjectionSchema.parse(initialProjection)
  return {
    get projection() {
      return projection
    },
    recordAction: async (execution, turn) => {
      projection = updateProjection({ execution, projection, turn })
      await onRecord?.({ execution, projection, turn })
    },
    renderContext: (observation) => formatMemoryContext({ observation, projection }),
  }
}

export function formatMemoryContext({
  observation,
  projection,
}: {
  readonly observation: AgentObservation
  readonly projection: PokemonMemoryProjection
}): string {
  const lines = [
    "Memory context:",
    `CURRENT_OBJECTIVE ${CURRENT_OBJECTIVE}`,
    ...projection.recentActions.slice(-RECENT_ACTION_LINES).map((recent) => {
      return `RECENT_ACTIONS ${recent.action}`
    }),
    ...formatMovementMemory({ observation, projection }),
  ]
  return lines.slice(0, 12).join("\n")
}

function updateProjection({
  execution,
  projection,
  turn,
}: {
  readonly execution: PokemonActionExecution
  readonly projection: PokemonMemoryProjection
  readonly turn: number
}): PokemonMemoryProjection {
  const step = firstActionStep(execution)
  const button = directionButton(step)
  const tile = execution.before.player.tile
  const mapName = execution.before.map.name ?? "unknown"
  const recentAction = {
    action: `T${turn} ${mapName} ${formatTile(tile)} ${formatAction(execution)}`,
    frame: execution.response.frameAfter,
    turn,
  }
  if (button === null || tile === null || execution.verification.moved) {
    return {
      ...projection,
      recentActions: [...projection.recentActions, recentAction].slice(-MAX_RECENT_ACTIONS),
    }
  }
  return {
    ...projection,
    movementAttempts: incrementMovementAttempt({
      attempt: {
        direction: button,
        failures: 1,
        lastFrame: execution.response.frameAfter,
        mapId: execution.before.map.id,
        mapName,
        tile,
      },
      movementAttempts: projection.movementAttempts,
    }),
    recentActions: [...projection.recentActions, recentAction].slice(-MAX_RECENT_ACTIONS),
  }
}

function incrementMovementAttempt({
  attempt,
  movementAttempts,
}: {
  readonly attempt: MovementAttemptMemory
  readonly movementAttempts: readonly MovementAttemptMemory[]
}): readonly MovementAttemptMemory[] {
  let updated = false
  const next = movementAttempts.map((current) => {
    if (!isSameMovementAttempt(current, attempt)) {
      return current
    }
    updated = true
    return {
      ...current,
      failures: current.failures + 1,
      lastFrame: attempt.lastFrame,
    }
  })
  return updated ? next : [...next, attempt]
}

function formatMovementMemory({
  observation,
  projection,
}: {
  readonly observation: AgentObservation
  readonly projection: PokemonMemoryProjection
}): readonly string[] {
  const liveTile = observation.state.player.tile
  return projection.movementAttempts.flatMap((attempt) => {
    const memory = `MOVEMENT_MEMORY ${attempt.mapName} ${formatTile(attempt.tile)} failed ${attempt.direction} x${attempt.failures}`
    if (attempt.failures < STUCK_FAILURE_THRESHOLD) {
      return [memory]
    }
    if (liveTile === null || !sameTile(liveTile, attempt.tile)) {
      return [
        memory,
        `INVALIDATED stale movement warning ${attempt.direction} at ${formatTile(attempt.tile)}`,
      ]
    }
    return [
      memory,
      `STUCK_WARNING Repeated failed ${attempt.direction} movement at ${formatTile(attempt.tile)}; avoid repeating it without a changed plan`,
    ]
  })
}

function formatAction(execution: PokemonActionExecution): string {
  const step = firstActionStep(execution)
  const button = directionButton(step)
  if (button !== null) {
    return `press_${button}`
  }
  if (step?.type === "button") {
    return `press_${step.button}`
  }
  return step?.type ?? "unknown"
}

function directionButton(
  step: ActionRequest["sequence"][number] | undefined,
): MovementDirection | null {
  if (step?.type !== "button") {
    return null
  }
  const button = step.button
  switch (button) {
    case "down":
    case "left":
    case "right":
    case "up":
      return button
    case "a":
    case "b":
    case "select":
    case "start":
      return null
    default:
      return assertNever(button)
  }
}

function firstActionStep(
  execution: PokemonActionExecution,
): ActionRequest["sequence"][number] | undefined {
  const action = execution.response.observation.lastAction
  if (action === null || !("sequence" in action)) {
    return undefined
  }
  return action.sequence[0]
}

function isSameMovementAttempt(left: MovementAttemptMemory, right: MovementAttemptMemory): boolean {
  return (
    left.direction === right.direction &&
    left.mapId === right.mapId &&
    sameTile(left.tile, right.tile)
  )
}

function sameTile(left: TilePosition, right: TilePosition): boolean {
  return left.x === right.x && left.y === right.y
}

function formatTile(tile: TilePosition | null): string {
  return tile === null ? "unknown" : `x=${tile.x}, y=${tile.y}`
}

function assertNever(value: never): never {
  throw new UnhandledMemoryActionButtonError(value)
}

class UnhandledMemoryActionButtonError extends Error {
  constructor(readonly value: never) {
    super(`unhandled memory action button: ${JSON.stringify(value)}`)
    this.name = "UnhandledMemoryActionButtonError"
  }
}
