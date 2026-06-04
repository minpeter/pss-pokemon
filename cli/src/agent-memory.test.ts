import { describe, expect, test } from "bun:test"
import {
  createInMemoryPokemonAgentMemory,
  formatMemoryContext,
  type PokemonAgentMemory,
} from "./agent-memory"
import { observationFixture } from "./agent-test-fixtures"
import type { PokemonActionExecution } from "./pokemon-action-executor"

describe("Pokemon agent memory", () => {
  test("builds a Pokemon-specific stuck warning from repeated failed movement", async () => {
    const memory = createInMemoryPokemonAgentMemory()

    await memory.recordAction(createExecution({ button: "up", turn: 1 }), 1)
    await memory.recordAction(createExecution({ button: "up", turn: 2 }), 2)
    await memory.recordAction(createExecution({ button: "up", turn: 3 }), 3)

    const context = memory.renderContext(observationFixture)

    expect(context).toContain("Memory context:")
    expect(context).toContain("CURRENT_OBJECTIVE Deliver Oak's Parcel and get Pokedex")
    expect(context).toContain("RECENT_ACTIONS T1 Pallet Town x=5, y=6 press_up")
    expect(context).toContain("MOVEMENT_MEMORY Pallet Town x=5, y=6 failed up x3")
    expect(context).toContain("STUCK_WARNING Repeated failed up movement")
    expect(context).toContain("avoid repeating it without a changed plan")
  })

  test("invalidates stale movement warnings when the live tile changes", async () => {
    const memory = createInMemoryPokemonAgentMemory()

    await memory.recordAction(createExecution({ button: "left", turn: 1 }), 1)
    await memory.recordAction(createExecution({ button: "left", turn: 2 }), 2)
    await memory.recordAction(createExecution({ button: "left", turn: 3 }), 3)

    const context = memory.renderContext({
      ...observationFixture,
      state: {
        ...observationFixture.state,
        player: { ...observationFixture.state.player, tile: { x: 4, y: 6 } },
      },
    })

    expect(context).not.toContain("STUCK_WARNING")
    expect(context).toContain("INVALIDATED stale movement warning")
  })

  test("renders memory context with a fixed line budget", () => {
    const projection = createProjectionWithRecentActions(12)

    const context = formatMemoryContext({ observation: observationFixture, projection })

    const lines = context.split("\n")
    expect(lines.length).toBeLessThanOrEqual(12)
    expect(context).toContain("RECENT_ACTIONS")
    expect(context).not.toContain("T1 ")
  })
})

function createExecution({
  button,
  turn,
}: {
  readonly button: "left" | "up"
  readonly turn: number
}): PokemonActionExecution {
  return {
    before: observationFixture.state,
    observation: {
      ...observationFixture,
      lastAction: {
        controllerId: "agent-test",
        sequence: [{ button, type: "button" }],
      },
    },
    response: {
      accepted: true,
      frameAfter: observationFixture.frame + turn,
      frameBefore: observationFixture.frame + turn - 1,
      observation: {
        ...observationFixture,
        lastAction: {
          controllerId: "agent-test",
          sequence: [{ button, type: "button" }],
        },
      },
    },
    verification: {
      battleChanged: false,
      dialogChanged: false,
      frameAdvanced: true,
      moved: false,
      playerTileAfter: "x=5, y=6",
      playerTileBefore: "x=5, y=6",
      stateChanged: true,
      summary: `frame advanced; ${button} blocked`,
    },
  }
}

function createProjectionWithRecentActions(count: number): PokemonAgentMemory["projection"] {
  return {
    invalidatedAssumptions: [],
    movementAttempts: [],
    recentActions: Array.from({ length: count }, (_, index) => ({
      action: `T${index + 1} Pallet Town x=5, y=6 press_up`,
      frame: index + 1,
      turn: index + 1,
    })),
  }
}
