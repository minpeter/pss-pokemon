import { describe, expect, test } from "bun:test"
import { observationFixture } from "./agent-test-fixtures"
import { decideRecoveryAction } from "./dialog-recovery-policy"
import type { GameState } from "./schemas"

describe("dialog recovery policy", () => {
  test("advances dialog until clear with bounded text skip", () => {
    const decision = decideRecoveryAction({
      controllerId: "agent-cli",
      state: stateWithDialog(true),
    })

    expect(decision).toEqual({
      action: {
        controllerId: "agent-cli",
        sequence: [
          {
            button: "a",
            maxPresses: 10,
            pressFrames: 6,
            type: "text_skip_until_dialog_end",
            waitFrames: 60,
          },
        ],
      },
      reason: "dialog active; advance until clear with bounded A presses",
      type: "action",
    })
    console.log("dialog clear maxPresses text_skip_until_dialog_end")
  })

  test("escapes suspected menu with bounded B and wait sequence", () => {
    const decision = decideRecoveryAction({
      controllerId: "agent-cli",
      screenHint: "menu",
      state: stateWithDialog(false),
    })

    expect(decision).toEqual({
      action: {
        controllerId: "agent-cli",
        sequence: [
          { button: "b", type: "button" },
          { frames: 60, type: "wait" },
        ],
      },
      reason: "menu suspected; press B and wait for settle",
      type: "action",
    })
  })

  test("waits bounded frames for suspected loading screens", () => {
    const decision = decideRecoveryAction({
      controllerId: "agent-cli",
      screenHint: "loading",
      state: stateWithDialog(false),
    })

    expect(decision).toEqual({
      action: {
        controllerId: "agent-cli",
        sequence: [{ frames: 60, type: "wait" }],
      },
      reason: "loading suspected; wait bounded frames",
      type: "action",
    })
  })

  test("falls back to macro planner when state is unknown", () => {
    expect(
      decideRecoveryAction({
        controllerId: "agent-cli",
        screenHint: "unknown",
        state: stateWithDialog(false),
      }),
    ).toEqual({
      reason: "no deterministic recovery signal; defer to macro planner",
      type: "fallback",
    })
  })
})

function stateWithDialog(active: boolean): GameState {
  return {
    ...observationFixture.state,
    dialog: {
      active,
      text: active ? "Hello!" : null,
    },
  }
}
