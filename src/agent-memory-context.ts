import type {
  MovementAttemptMemory,
  PokemonMemoryProjection,
  PokemonMemoryProjectionInput,
  TilePosition,
} from "./agent-memory-model"
import { PokemonMemoryProjectionSchema } from "./agent-memory-model"
import type { AgentObservation } from "./agent-observation-types"

const CONTEXT_LINE_BUDGET = 12
const PROGRESS_FACT_LINES = 3
const RECENT_ACTION_LINES = 4
const UNTRUSTED_DIALOG_LINES = 1
const STUCK_FAILURE_THRESHOLD = 3
const CURRENT_OBJECTIVE = "Deliver Oak's Parcel and get Pokedex"

export function formatMemoryContext({
  observation,
  projection,
}: {
  readonly observation: AgentObservation
  readonly projection: PokemonMemoryProjectionInput
}): string {
  const normalizedProjection = PokemonMemoryProjectionSchema.parse(projection)
  const lines = [
    "Memory context:",
    `CURRENT_OBJECTIVE ${CURRENT_OBJECTIVE}`,
    ...normalizedProjection.progressFacts.slice(-PROGRESS_FACT_LINES).map((fact) => {
      return `PROGRESS_FACT ${fact.fact}`
    }),
    ...normalizedProjection.recentActions.slice(-RECENT_ACTION_LINES).map((recent) => {
      return `RECENT_ACTIONS ${recent.action}`
    }),
    ...normalizedProjection.untrustedDialogFacts.slice(-UNTRUSTED_DIALOG_LINES).map((dialog) => {
      return `UNTRUSTED_DIALOG_TEXT "${dialog.text}"`
    }),
    ...formatMovementMemory({ observation, projection: normalizedProjection }),
  ]
  return lines.slice(0, CONTEXT_LINE_BUDGET).join("\n")
}

function formatMovementMemory({
  observation,
  projection,
}: {
  readonly observation: AgentObservation
  readonly projection: PokemonMemoryProjection
}): readonly string[] {
  return [...projection.movementAttempts]
    .sort(
      (left, right) =>
        rankMovementAttempt(right, observation) - rankMovementAttempt(left, observation),
    )
    .flatMap((attempt) => formatMovementAttempt({ attempt, observation }))
}

function formatMovementAttempt({
  attempt,
  observation,
}: {
  readonly attempt: MovementAttemptMemory
  readonly observation: AgentObservation
}): readonly string[] {
  const memory = `MOVEMENT_MEMORY ${attempt.mapName} ${formatTile(attempt.tile)} failed ${attempt.direction} x${attempt.failures}`
  if (attempt.failures < STUCK_FAILURE_THRESHOLD) {
    return [memory]
  }
  if (!isSameLiveLocation(attempt, observation)) {
    return [
      memory,
      `INVALIDATED stale movement warning ${attempt.direction} at ${formatTile(attempt.tile)}`,
    ]
  }
  if (isDirectionPassable(attempt, observation)) {
    return [
      memory,
      `CONFLICTING_MEMORY ${attempt.direction} at ${formatTile(attempt.tile)} is now passable`,
    ]
  }
  return [
    memory,
    `STUCK_WARNING Repeated failed ${attempt.direction} movement at ${formatTile(attempt.tile)}; avoid repeating it without a changed plan`,
  ]
}

function rankMovementAttempt(
  attempt: MovementAttemptMemory,
  observation: AgentObservation,
): number {
  const liveTile = observation.state.player.tile
  const sameMapScore = isSameMap(attempt, observation) ? 1_000 : 0
  const sameTileScore = liveTile !== null && sameTile(liveTile, attempt.tile) ? 1_000 : 0
  return sameMapScore + sameTileScore + attempt.failures * 10 + attempt.lastFrame / 1_000_000
}

function isSameLiveLocation(
  attempt: MovementAttemptMemory,
  observation: AgentObservation,
): boolean {
  const liveTile = observation.state.player.tile
  return liveTile !== null && isSameMap(attempt, observation) && sameTile(liveTile, attempt.tile)
}

function isSameMap(attempt: MovementAttemptMemory, observation: AgentObservation): boolean {
  const liveMapId = observation.state.map.id
  if (attempt.mapId !== null && liveMapId !== null) {
    return attempt.mapId === liveMapId
  }
  return attempt.mapName === (observation.state.map.name ?? "unknown")
}

function isDirectionPassable(
  attempt: MovementAttemptMemory,
  observation: AgentObservation,
): boolean {
  return observation.state.collision.passableDirections.includes(attempt.direction)
}

function sameTile(left: TilePosition, right: TilePosition): boolean {
  return left.x === right.x && left.y === right.y
}

function formatTile(tile: TilePosition): string {
  return `x=${tile.x}, y=${tile.y}`
}
