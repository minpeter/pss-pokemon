import { describe, expect, test } from "bun:test"
import {
  evaluateRedBlueObjective,
  evaluateRedBlueObjectives,
  ObjectiveResultSchema,
  RED_BLUE_OBJECTIVES,
  type RedBlueObjectiveId,
  UnknownObjectiveError,
} from "./objective-registry"
import { type GameState, ObservationSchema } from "./schemas"

const abiFixtureRoot = new URL("../test-fixtures/abi-v1/", import.meta.url)

async function loadFixtureState(): Promise<GameState> {
  const raw: unknown = await Bun.file(new URL("observation.json", abiFixtureRoot)).json()
  return ObservationSchema.parse(raw).state
}

describe("Red/Blue objective registry", () => {
  test("lists functional and benchmark objectives without product-demo mixing", () => {
    expect(RED_BLUE_OBJECTIVES.map((objective) => objective.objectiveId)).toEqual([
      "redblue.pallet_fake_smoke",
      "redblue.starter_acquisition",
      "redblue.viridian_arrival",
      "redblue.oak_parcel",
      "redblue.first_gym",
    ])
    expect(RED_BLUE_OBJECTIVES.map((objective) => objective.kind)).toEqual([
      "functional_test",
      "benchmark_milestone",
      "benchmark_milestone",
      "benchmark_milestone",
      "benchmark_milestone",
    ])
  })

  test("passes starter acquisition from fixture flags and party state", async () => {
    const state = await loadFixtureState()
    const result = ObjectiveResultSchema.parse(
      evaluateRedBlueObjective("redblue.starter_acquisition", state),
    )

    expect(result).toEqual(
      expect.objectContaining({
        confidence: 1,
        kind: "benchmark_milestone",
        objectiveId: "redblue.starter_acquisition",
        status: "passed",
        type: "objective_result",
      }),
    )
    expect(result.evidence).toContain("flag got_starter=true")
    expect(result.evidence).toContain("party count=1")
  })

  test("keeps unmet milestones in progress for the Pallet fixture", async () => {
    const state = await loadFixtureState()

    expect(evaluateRedBlueObjective("redblue.pallet_fake_smoke", state).status).toBe("passed")
    expect(evaluateRedBlueObjective("redblue.viridian_arrival", state)).toEqual(
      expect.objectContaining({
        evidence: expect.arrayContaining(["map=Pallet Town"]),
        status: "in_progress",
      }),
    )
    expect(evaluateRedBlueObjective("redblue.oak_parcel", state).status).toBe("in_progress")
    expect(evaluateRedBlueObjective("redblue.first_gym", state).status).toBe("in_progress")
  })

  test("fails deterministically when no ROM or fake backend state is loaded", async () => {
    const state = await loadFixtureState()
    const noRomState: GameState = {
      ...state,
      emulator: { ...state.emulator, romLoaded: false },
    }

    const result = evaluateRedBlueObjective("redblue.pallet_fake_smoke", noRomState)

    expect(result).toEqual(
      expect.objectContaining({
        confidence: 1,
        evidence: ["romLoaded=false"],
        status: "failed",
      }),
    )
  })

  test("evaluates all registry entries with required result fields", async () => {
    const state = await loadFixtureState()
    const results = evaluateRedBlueObjectives(state)

    expect(results).toHaveLength(RED_BLUE_OBJECTIVES.length)
    for (const result of results) {
      expect(ObjectiveResultSchema.parse(result)).toEqual(result)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
      expect(result.evidence.length).toBeGreaterThan(0)
    }
  })

  test("rejects unknown objective ids", async () => {
    const state = await loadFixtureState()

    expect(() => evaluateRedBlueObjective("redblue.unknown" as RedBlueObjectiveId, state)).toThrow(
      UnknownObjectiveError,
    )
  })
})
