import { describe, expect, test } from "bun:test"
import { actionForKey } from "./keymap"

describe("actionForKey", () => {
  test("maps WASD and A/B controls to button sequences", () => {
    expect(actionForKey("w")).toEqual({
      controllerId: "manual-cli",
      sequence: [{ type: "button", button: "up" }],
    })
    expect(actionForKey("j")).toEqual({
      controllerId: "manual-cli",
      sequence: [{ type: "button", button: "a" }],
    })
    expect(actionForKey("\r")).toEqual({
      controllerId: "manual-cli",
      sequence: [{ type: "button", button: "start" }],
    })
    expect(actionForKey("\b")).toEqual({
      controllerId: "manual-cli",
      sequence: [{ type: "button", button: "select" }],
    })
  })

  test("maps unknown keys to null", () => {
    expect(actionForKey("?")).toBeNull()
    expect(actionForKey("toString")).toBeNull()
  })

  test("maps uppercase J to dialog-aware text skip action", () => {
    const action = actionForKey("J")

    expect(action?.controllerId).toBe("manual-cli")
    expect(JSON.parse(JSON.stringify(action?.sequence))).toEqual([
      {
        type: "text_skip_until_dialog_end",
        button: "a",
      },
    ])
  })

  test("uses the injected controller id for human-model control loops", () => {
    expect(actionForKey("j", "agent-cli")).toEqual({
      controllerId: "agent-cli",
      sequence: [{ type: "button", button: "a" }],
    })
  })
})
