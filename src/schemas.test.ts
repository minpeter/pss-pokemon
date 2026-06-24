import { describe, expect, test } from "bun:test"
import { z } from "zod"
import {
  ActionRequestSchema,
  ActionResponseSchema,
  ObservationSchema,
  ScreenshotSchema,
} from "./schemas"
import { TraceReplaySchema } from "./trace-replay"

const abiFixtureRoot = new URL("../test-fixtures/abi-v1/", import.meta.url)

async function loadAbiFixture(name: string): Promise<unknown> {
  const fixture: unknown = await Bun.file(new URL(name, abiFixtureRoot)).json()
  return fixture
}

const AbiMetadataSchema = z
  .object({
    abiVersion: z.literal("v1"),
    exampleId: z.string().min(1),
    kind: z.string().min(1),
    recordedAt: z.string().min(1),
    source: z.string().min(1),
  })
  .strict()

const EventFixtureSchema = z
  .object({
    metadata: AbiMetadataSchema.extend({
      kind: z.literal("event"),
      source: z.literal("pss-runtime"),
    }),
    example: z
      .object({
        text: z.string().min(1),
        type: z.literal("event"),
      })
      .strict(),
  })
  .strict()

const ObjectiveResultFixtureSchema = z
  .object({
    metadata: AbiMetadataSchema.extend({
      kind: z.literal("objective_result"),
      source: z.literal("dashboard"),
    }),
    example: z
      .object({
        objective: z
          .object({
            done: z.boolean(),
            text: z.string().min(1),
            tier: z.enum(["primary", "secondary", "tertiary"]),
          })
          .strict(),
        result: z
          .object({
            evidence: z.array(z.string().min(1)),
            status: z.enum(["passed", "failed", "in_progress"]),
            summary: z.string().min(1),
          })
          .strict(),
        type: z.literal("objective_result"),
      })
      .strict(),
  })
  .strict()

const DoneClaimFixtureSchema = z
  .object({
    metadata: AbiMetadataSchema.extend({
      kind: z.literal("doneclaim"),
      source: z.literal("agent"),
    }),
    example: z
      .object({
        evidence: z.array(z.string().min(1)),
        observables: z.array(z.string().min(1)),
        result: z.enum(["PASS", "FAIL"]),
        task: z.string().min(1),
        type: z.literal("doneclaim"),
      })
      .strict(),
  })
  .strict()

const observationFixture = {
  type: "observation",
  abiVersion: "v1",
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

  test("rejects action tokens beyond supervised frame bounds", () => {
    expect(() => ActionRequestSchema.parse({ actions: ["wait_601"] })).toThrow()
    expect(() => ActionRequestSchema.parse({ actions: ["hold_a_601"] })).toThrow()
    expect(() =>
      ActionRequestSchema.parse({
        sequence: [{ type: "wait", frames: 601 }],
      }),
    ).toThrow()
  })
})

describe("Shared ABI fixtures", () => {
  test("loads fixture files and validates observation/action schemas", async () => {
    const observation = ObservationSchema.parse(await loadAbiFixture("observation.json"))
    const actionRequest = ActionRequestSchema.parse(await loadAbiFixture("action-request.json"))
    const actionResponse = ActionResponseSchema.parse(await loadAbiFixture("action-response.json"))

    expect(observation.screenshot).toEqual({
      abiVersion: "v1",
      height: 1,
      pngBase64: "AA==",
      width: 1,
    })
    expect(observation.abiVersion).toBe("v1")
    expect(actionRequest.controllerId).toBe("agent-cli")
    expect(actionResponse.accepted).toBe(true)
    expect(actionResponse.observation.abiVersion).toBe("v1")
    expect(actionResponse.observation.lastAction).toEqual(actionRequest)
    expect(() => ObservationSchema.parse({ type: "observation" })).toThrow()
  })

  test("loads fixture metadata examples with required structural keys", async () => {
    const eventFixture = EventFixtureSchema.parse(await loadAbiFixture("event.json"))
    const replayFixture = TraceReplaySchema.parse(await loadAbiFixture("replay.json"))
    const objectiveFixture = ObjectiveResultFixtureSchema.parse(
      await loadAbiFixture("objective-result.json"),
    )
    const doneClaimFixture = DoneClaimFixtureSchema.parse(await loadAbiFixture("doneclaim.json"))

    expect(eventFixture.metadata.kind).toBe("event")
    expect(replayFixture.events.length).toBeGreaterThan(0)
    expect(replayFixture.metadata.type).toBe("harness_run_metadata")
    expect(objectiveFixture.example.objective.tier).toBe("primary")
    expect(doneClaimFixture.example.task).toBe("task-6")
  })
})

describe("ScreenshotSchema ABI", () => {
  test("accepts and preserves backend abi v1 screenshot payloads", () => {
    const parsed = ScreenshotSchema.parse({
      abiVersion: "v1",
      frame: 12,
      height: 144,
      pngBase64: "AA==",
      width: 160,
    })

    expect(parsed.abiVersion).toBe("v1")
  })

  test("keeps compatibility with screenshot payloads that omit abi version", () => {
    const parsed = ScreenshotSchema.parse({
      frame: 12,
      pngBase64: "AA==",
    })

    expect(parsed).toEqual({ frame: 12, pngBase64: "AA==" })
  })
})
