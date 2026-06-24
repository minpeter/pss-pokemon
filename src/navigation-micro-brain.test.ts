import { describe, expect, test } from "bun:test"
import { observationFixture } from "./agent-test-fixtures"
import { decideNavigationAction } from "./navigation-micro-controller"

describe("navigation micro brain", () => {
  test("chooses a passable direction and leaves supervisor-compatible action", () => {
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
    console.log("passable objective-progress supervisor-accepted")
  })
})
