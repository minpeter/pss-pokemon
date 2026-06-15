import { describe, expect, test } from "bun:test"
import { observationFixture } from "./agent-test-fixtures"
import { decideNavigationAction } from "./navigation-micro-controller"
import type { GameState } from "./schemas"

describe("navigation micro-controller", () => {
  test("walks toward a reachable target using current passability", () => {
    const decision = decideNavigationAction({
      state: observationFixture.state,
      subgoal: {
        controllerId: "agent-cli",
        targetMapName: "Pallet Town",
        targetTile: { x: 5, y: 4 },
      },
    })

    expect(decision).toEqual({
      action: {
        controllerId: "agent-cli",
        sequence: [{ direction: "up", type: "walk" }],
      },
      reason: "walk up toward x=5, y=4",
      type: "action",
    })
  })

  test("chooses an alternate reducing axis when the preferred direction is blocked", () => {
    const state: GameState = {
      ...observationFixture.state,
      collision: {
        ...observationFixture.state.collision,
        passableDirections: ["left"],
      },
    }

    const decision = decideNavigationAction({
      state,
      subgoal: {
        controllerId: "agent-cli",
        targetTile: { x: 3, y: 4 },
      },
    })

    expect(decision).toEqual({
      action: {
        controllerId: "agent-cli",
        sequence: [{ direction: "left", type: "walk" }],
      },
      reason: "walk left toward x=3, y=4",
      type: "action",
    })
  })

  test("reaches a deterministic fixture target in the minimum action count", () => {
    let state = observationFixture.state
    const actions: string[] = []

    for (let step = 0; step < 4; step += 1) {
      const decision = decideNavigationAction({
        state,
        subgoal: {
          controllerId: "agent-cli",
          targetTile: { x: 5, y: 4 },
        },
      })
      if (decision.type !== "action") {
        break
      }
      const actionStep = decision.action.sequence[0]
      if (actionStep?.type !== "walk") {
        throw new Error("expected navigation brain to emit walk steps only")
      }
      actions.push(actionStep.direction)
      state = movePlayerTile(state, actionStep.direction)
    }

    expect(actions).toEqual(["up", "up"])
    expect(actions).toHaveLength(2)
  })

  test("returns complete, wrong-map, unknown-position, or blocked without forcing actions", () => {
    expect(
      decideNavigationAction({
        state: observationFixture.state,
        subgoal: { controllerId: "agent-cli", targetTile: { x: 5, y: 6 } },
      }),
    ).toEqual({ reason: "target tile reached", type: "complete" })

    expect(
      decideNavigationAction({
        state: observationFixture.state,
        subgoal: {
          controllerId: "agent-cli",
          targetMapName: "Viridian City",
          targetTile: { x: 5, y: 6 },
        },
      }),
    ).toEqual({
      reason: "current map Pallet Town is not Viridian City",
      type: "wrong_map",
    })

    expect(
      decideNavigationAction({
        state: {
          ...observationFixture.state,
          player: { ...observationFixture.state.player, tile: null },
        },
        subgoal: { controllerId: "agent-cli", targetTile: { x: 5, y: 4 } },
      }),
    ).toEqual({ reason: "player tile is unknown", type: "unknown_position" })

    expect(
      decideNavigationAction({
        state: {
          ...observationFixture.state,
          collision: { ...observationFixture.state.collision, passableDirections: [] },
        },
        subgoal: { controllerId: "agent-cli", targetTile: { x: 5, y: 4 } },
      }),
    ).toEqual({ reason: "no passable direction reduces distance to target", type: "blocked" })
  })
})

function movePlayerTile(state: GameState, direction: "up" | "down" | "left" | "right"): GameState {
  const tile = state.player.tile
  if (tile === null) {
    throw new Error("expected known player tile")
  }
  const nextTile = {
    x: tile.x + (direction === "right" ? 1 : direction === "left" ? -1 : 0),
    y: tile.y + (direction === "down" ? 1 : direction === "up" ? -1 : 0),
  }
  return {
    ...state,
    collision: { ...state.collision, playerTile: nextTile },
    player: { ...state.player, tile: nextTile },
  }
}
