import { describe, expect, test } from "bun:test"
import { observationFixture } from "./agent-test-fixtures"
import { decideBattleAction } from "./battle-policy"
import type { GameState } from "./schemas"

describe("battle policy", () => {
  test("chooses default attack from the battle main menu", () => {
    const decision = decideBattleAction({
      controllerId: "agent-cli",
      state: battleState({ moves: ["Tackle", "Tail Whip"] }),
    })

    expect(decision).toEqual({
      action: {
        controllerId: "agent-cli",
        sequence: [
          { button: "a", type: "button" },
          { button: "a", type: "button" },
        ],
      },
      reason: "battle_policy.default_attack default attack with Tackle",
      type: "action",
    })
    console.log("battle_policy.default_attack default attack no item waste")
  })

  test("uses selected fight menu directly when already in move selection", () => {
    const decision = decideBattleAction({
      controllerId: "agent-cli",
      menuHint: "fight",
      state: battleState({ moves: ["Tackle"] }),
    })

    expect(decision).toEqual({
      action: {
        controllerId: "agent-cli",
        sequence: [{ button: "a", type: "button" }],
      },
      reason: "battle_policy.default_attack default attack with Tackle",
      type: "action",
    })
  })

  test("backs out of bag menu to avoid item waste", () => {
    const decision = decideBattleAction({
      controllerId: "agent-cli",
      menuHint: "bag",
      state: battleState({ moves: ["Tackle"] }),
    })

    expect(decision).toEqual({
      action: {
        controllerId: "agent-cli",
        sequence: [
          { button: "b", type: "button" },
          { frames: 60, type: "wait" },
        ],
      },
      reason: "bag menu suspected; back out to avoid item waste",
      type: "action",
    })
  })

  test("falls back when battle or move state is unknown", () => {
    expect(
      decideBattleAction({
        controllerId: "agent-cli",
        state: observationFixture.state,
      }),
    ).toEqual({ reason: "battle is not active", type: "fallback" })

    expect(
      decideBattleAction({
        controllerId: "agent-cli",
        state: battleState({ moves: [] }),
      }),
    ).toEqual({ reason: "lead move state is unknown", type: "fallback" })

    expect(
      decideBattleAction({
        controllerId: "agent-cli",
        menuHint: "unknown",
        state: battleState({ moves: ["Tackle"] }),
      }),
    ).toEqual({ reason: "battle menu state is unknown", type: "fallback" })
  })
})

function battleState({ moves }: { readonly moves: readonly string[] }): GameState {
  const lead = observationFixture.state.party[0]
  if (lead === undefined) {
    throw new Error("expected fixture lead Pokemon")
  }
  return {
    ...observationFixture.state,
    battle: {
      active: true,
      enemy: {
        hp: 10,
        level: 5,
        maxHp: 10,
        moves: ["Scratch"],
        species: "Charmander",
        status: null,
      },
      kind: "trainer",
      opponent: "BLUE",
    },
    party: [{ ...lead, moves: [...moves] }],
  }
}
