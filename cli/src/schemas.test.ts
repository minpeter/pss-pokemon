import { describe, expect, test } from "bun:test"
import { ActionRequestSchema, ObservationSchema } from "./schemas"

const observationFixture = {
  type: "observation",
  timestamp: "2026-06-04T00:00:00.000Z",
  frame: 76,
  state: {
    emulator: { frame: 76, romLoaded: true, saveStateLoaded: true },
    player: { name: "RED", tile: { x: 5, y: 6 }, facing: "up" },
    map: { id: 0, name: "Pallet Town" },
    party: [{ species: "Squirtle", level: 5, hp: 19, maxHp: 19, status: null }],
    bag: [{ name: "Potion", quantity: 1 }],
    badges: { owned: [] },
    battle: { active: false, kind: null, opponent: null },
    dialog: { active: false, text: null },
    flags: { values: {} },
    collision: {
      mapId: 0,
      mapName: "Pallet Town",
      width: 3,
      height: 3,
      grid: [
        [true, true, true],
        [true, false, true],
        [true, true, true],
      ],
      playerTile: { x: 5, y: 6 },
      passableDirections: ["up", "left", "right"],
    },
    parserWarnings: [],
  },
  screenshot: {
    pngBase64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    width: 1,
    height: 1,
  },
  lastAction: null,
  parserWarnings: [],
}

describe("ObservationSchema", () => {
  test("accepts backend observation fixtures", () => {
    const parsed = ObservationSchema.parse(observationFixture)

    expect(parsed.state.collision.playerTile).toEqual({ x: 5, y: 6 })
  })

  test("rejects malformed observations", () => {
    expect(() => ObservationSchema.parse({ type: "observation" })).toThrow()
  })

  test("accepts dialog-aware text skip last action", () => {
    const action = {
      controllerId: "manual-cli",
      sequence: [{ type: "text_skip_until_dialog_end", button: "a" }],
    } as const

    const parsedAction = ActionRequestSchema.parse(action)
    const parsedObservation = ObservationSchema.parse({
      ...observationFixture,
      lastAction: action,
    })

    expect(JSON.parse(JSON.stringify(parsedAction.sequence))).toEqual(action.sequence)
    expect(JSON.parse(JSON.stringify(parsedObservation.lastAction?.sequence))).toEqual(
      action.sequence,
    )
  })

  test("normalizes Nous-style action tokens to typed backend sequence", () => {
    const parsedAction = ActionRequestSchema.parse({
      actions: ["walk_up", "press_a", "wait_60", "hold_a_30", "a_until_dialog_end"],
    })

    expect(parsedAction).toEqual({
      controllerId: "agent-cli",
      sequence: [
        { direction: "up", type: "walk" },
        { button: "a", type: "button" },
        { frames: 60, type: "wait" },
        { button: "a", frames: 30, type: "hold" },
        { button: "a", type: "text_skip_until_dialog_end" },
      ],
    })
  })

  test("rejects unknown Nous-style action tokens", () => {
    expect(() => ActionRequestSchema.parse({ actions: ["teleport_home"] })).toThrow()
  })
})
