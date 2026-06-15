import type { ActionRequest, Direction, GameState } from "./schemas"

export type NavigationSubgoal = {
  readonly controllerId: string
  readonly targetMapName?: string
  readonly targetTile: {
    readonly x: number
    readonly y: number
  }
}

export type NavigationDecision =
  | {
      readonly action: ActionRequest
      readonly reason: string
      readonly type: "action"
    }
  | {
      readonly reason: string
      readonly type: "blocked" | "complete" | "wrong_map" | "unknown_position"
    }

export function decideNavigationAction({
  state,
  subgoal,
}: {
  readonly state: GameState
  readonly subgoal: NavigationSubgoal
}): NavigationDecision {
  if (subgoal.targetMapName !== undefined && state.map.name !== subgoal.targetMapName) {
    return {
      reason: `current map ${state.map.name ?? "unknown"} is not ${subgoal.targetMapName}`,
      type: "wrong_map",
    }
  }

  const tile = state.player.tile
  if (tile === null) {
    return { reason: "player tile is unknown", type: "unknown_position" }
  }

  if (tile.x === subgoal.targetTile.x && tile.y === subgoal.targetTile.y) {
    return { reason: "target tile reached", type: "complete" }
  }

  const direction = chooseBestDirection({
    passableDirections: state.collision.passableDirections,
    start: tile,
    target: subgoal.targetTile,
  })
  if (direction === null) {
    return { reason: "no passable direction reduces distance to target", type: "blocked" }
  }

  return {
    action: {
      controllerId: subgoal.controllerId,
      sequence: [{ direction, type: "walk" }],
    },
    reason: `walk ${direction} toward x=${subgoal.targetTile.x}, y=${subgoal.targetTile.y}`,
    type: "action",
  }
}

function chooseBestDirection({
  passableDirections,
  start,
  target,
}: {
  readonly passableDirections: readonly string[]
  readonly start: { readonly x: number; readonly y: number }
  readonly target: { readonly x: number; readonly y: number }
}): Direction | null {
  const passable = new Set(passableDirections)
  const candidates = directionCandidates(start, target).filter((candidate) =>
    passable.has(candidate),
  )
  return candidates.at(0) ?? null
}

function directionCandidates(
  start: { readonly x: number; readonly y: number },
  target: { readonly x: number; readonly y: number },
): readonly Direction[] {
  const horizontal: Direction | null =
    target.x > start.x ? "right" : target.x < start.x ? "left" : null
  const vertical: Direction | null = target.y > start.y ? "down" : target.y < start.y ? "up" : null

  if (horizontal === null) {
    return vertical === null ? [] : [vertical]
  }
  if (vertical === null) {
    return [horizontal]
  }
  const horizontalDistance = Math.abs(target.x - start.x)
  const verticalDistance = Math.abs(target.y - start.y)
  return horizontalDistance >= verticalDistance ? [horizontal, vertical] : [vertical, horizontal]
}
