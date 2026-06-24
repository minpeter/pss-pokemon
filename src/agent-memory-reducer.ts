import {
  collectDialogFact,
  collectProgressFacts,
  mergeDialogFacts,
  mergeProgressFacts,
} from "./agent-memory-facts"
import type {
  MovementAttemptMemory,
  MovementDirection,
  PokemonMemoryProjection,
  TilePosition,
} from "./agent-memory-model"
import type { PokemonActionExecution } from "./pokemon-action-executor"
import type { ActionRequest } from "./schemas"

const MAX_RECENT_ACTIONS = 8
const MAX_MOVEMENT_ATTEMPTS = 32
type ActionButton = Extract<
  ActionRequest["sequence"][number],
  { readonly button: string }
>["button"]

export function updateProjection({
  execution,
  projection,
  turn,
}: {
  readonly execution: PokemonActionExecution
  readonly projection: PokemonMemoryProjection
  readonly turn: number
}): PokemonMemoryProjection {
  const step = firstActionStep(execution)
  const direction = directionStep(step)
  const tile = execution.before.player.tile
  const mapName = execution.before.map.name ?? "unknown"
  const recentAction = {
    action: `T${turn} ${mapName} ${formatTile(tile)} ${formatAction(execution)}`,
    frame: execution.response.frameAfter,
    turn,
  }
  const nextProjection = {
    ...projection,
    progressFacts: mergeProgressFacts({
      current: projection.progressFacts,
      next: collectProgressFacts({
        frame: execution.response.frameAfter,
        state: execution.response.observation.state,
        turn,
      }),
    }),
    recentActions: [...projection.recentActions, recentAction].slice(-MAX_RECENT_ACTIONS),
    untrustedDialogFacts: mergeDialogFacts({
      current: projection.untrustedDialogFacts,
      next: collectDialogFact({
        frame: execution.response.frameAfter,
        state: execution.response.observation.state,
        turn,
      }),
    }),
  }
  if (direction === null || tile === null || execution.verification.moved) {
    return nextProjection
  }
  return {
    ...nextProjection,
    movementAttempts: incrementMovementAttempt({
      attempt: {
        direction,
        failures: 1,
        lastFrame: execution.response.frameAfter,
        mapId: execution.before.map.id,
        mapName,
        tile,
      },
      movementAttempts: projection.movementAttempts,
    }),
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
  const attempts = updated ? next : [...next, attempt]
  return attempts.sort(compareMovementRecency).slice(-MAX_MOVEMENT_ATTEMPTS)
}

function formatAction(execution: PokemonActionExecution): string {
  const step = firstActionStep(execution)
  const direction = directionStep(step)
  if (direction !== null) {
    return step?.type === "walk" ? `walk_${direction}` : `press_${direction}`
  }
  if (step?.type === "button") {
    return `press_${step.button}`
  }
  return step?.type ?? "unknown"
}

function directionStep(
  step: ActionRequest["sequence"][number] | undefined,
): MovementDirection | null {
  if (step === undefined) {
    return null
  }
  switch (step.type) {
    case "button":
      return directionButton(step.button)
    case "hold":
      return directionButton(step.button)
    case "walk":
      return step.direction
    case "text_skip_until_dialog_end":
    case "wait":
      return null
    default:
      return assertNever(step)
  }
}

function directionButton(button: ActionButton): MovementDirection | null {
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

function compareMovementRecency(left: MovementAttemptMemory, right: MovementAttemptMemory): number {
  return left.lastFrame - right.lastFrame
}

function assertNever(value: never): never {
  throw new UnhandledMemoryProjectionError(value)
}

class UnhandledMemoryProjectionError extends Error {
  constructor(readonly value: never) {
    super(`unhandled memory projection value: ${JSON.stringify(value)}`)
    this.name = "UnhandledMemoryProjectionError"
  }
}
