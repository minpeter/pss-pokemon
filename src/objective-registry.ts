import { z } from "zod"
import type { GameState } from "./schemas"

export const ObjectiveStatusSchema = z.enum(["passed", "failed", "in_progress"])
export const ObjectiveKindSchema = z.enum(["functional_test", "benchmark_milestone"])

export const ObjectiveResultSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string().min(1)).min(1),
    kind: ObjectiveKindSchema,
    objectiveId: z.string().min(1),
    status: ObjectiveStatusSchema,
    summary: z.string().min(1),
    type: z.literal("objective_result"),
  })
  .strict()

export type ObjectiveStatus = z.infer<typeof ObjectiveStatusSchema>
export type ObjectiveKind = z.infer<typeof ObjectiveKindSchema>
export type ObjectiveResult = z.infer<typeof ObjectiveResultSchema>
type ObjectiveResultInput = Omit<ObjectiveResult, "type">

export type RedBlueObjectiveId =
  | "redblue.pallet_fake_smoke"
  | "redblue.viridian_arrival"
  | "redblue.starter_acquisition"
  | "redblue.oak_parcel"
  | "redblue.first_gym"

export type ObjectiveDefinition = {
  readonly objectiveId: RedBlueObjectiveId
  readonly kind: ObjectiveKind
  readonly title: string
  readonly evaluate: (state: GameState) => ObjectiveResult
}

export const RED_BLUE_OBJECTIVES: readonly ObjectiveDefinition[] = [
  {
    evaluate: evaluatePalletFakeSmoke,
    kind: "functional_test",
    objectiveId: "redblue.pallet_fake_smoke",
    title: "Pallet fake backend smoke",
  },
  {
    evaluate: evaluateStarterAcquisition,
    kind: "benchmark_milestone",
    objectiveId: "redblue.starter_acquisition",
    title: "Starter acquired",
  },
  {
    evaluate: evaluateViridianArrival,
    kind: "benchmark_milestone",
    objectiveId: "redblue.viridian_arrival",
    title: "Reach Viridian City",
  },
  {
    evaluate: evaluateOakParcel,
    kind: "benchmark_milestone",
    objectiveId: "redblue.oak_parcel",
    title: "Carry Oak's Parcel",
  },
  {
    evaluate: evaluateFirstGym,
    kind: "benchmark_milestone",
    objectiveId: "redblue.first_gym",
    title: "Boulder Badge acquired",
  },
]

export function evaluateRedBlueObjective(
  objectiveId: RedBlueObjectiveId,
  state: GameState,
): ObjectiveResult {
  const objective = RED_BLUE_OBJECTIVES.find((candidate) => candidate.objectiveId === objectiveId)
  if (objective === undefined) {
    throw new UnknownObjectiveError(objectiveId)
  }
  return ObjectiveResultSchema.parse(objective.evaluate(state))
}

export function evaluateRedBlueObjectives(state: GameState): readonly ObjectiveResult[] {
  return RED_BLUE_OBJECTIVES.map((objective) =>
    evaluateRedBlueObjective(objective.objectiveId, state),
  )
}

export class UnknownObjectiveError extends Error {
  constructor(readonly objectiveId: string) {
    super(`unknown Red/Blue objective: ${objectiveId}`)
    this.name = "UnknownObjectiveError"
  }
}

function evaluatePalletFakeSmoke(state: GameState): ObjectiveResult {
  const noRom = failWhenRomMissing("redblue.pallet_fake_smoke", "functional_test", state)
  if (noRom !== null) {
    return noRom
  }

  const mapName = state.map.name ?? "unknown"
  const tile = formatTile(state.player.tile)
  const isPallet = sameText(mapName, "Pallet Town")
  return createResult({
    confidence: isPallet && state.player.tile !== null ? 1 : 0.55,
    evidence: [
      `map=${mapName}`,
      `tile=${tile}`,
      `party count=${state.party.length}`,
      `frame=${state.emulator.frame}`,
    ],
    kind: "functional_test",
    objectiveId: "redblue.pallet_fake_smoke",
    status: isPallet && state.player.tile !== null ? "passed" : "in_progress",
    summary:
      isPallet && state.player.tile !== null
        ? "Fake backend is producing a Pallet Town state with a player tile."
        : "Waiting for a Pallet Town state with a known player tile.",
  })
}

function evaluateStarterAcquisition(state: GameState): ObjectiveResult {
  const noRom = failWhenRomMissing("redblue.starter_acquisition", "benchmark_milestone", state)
  if (noRom !== null) {
    return noRom
  }

  const partyCount = state.party.length
  const species = state.party.at(0)?.species ?? null
  const hasStarterFlag = state.flags.values["got_starter"] === true
  const passed = hasStarterFlag || partyCount > 0
  return createResult({
    confidence: passed ? (hasStarterFlag ? 1 : 0.85) : 0.45,
    evidence: [
      `flag got_starter=${hasStarterFlag}`,
      `party count=${partyCount}`,
      `lead=${species ?? "none"}`,
    ],
    kind: "benchmark_milestone",
    objectiveId: "redblue.starter_acquisition",
    status: passed ? "passed" : "in_progress",
    summary: passed ? "Starter ownership evidence is present." : "No starter evidence yet.",
  })
}

function evaluateViridianArrival(state: GameState): ObjectiveResult {
  const noRom = failWhenRomMissing("redblue.viridian_arrival", "benchmark_milestone", state)
  if (noRom !== null) {
    return noRom
  }

  const mapName = state.map.name ?? "unknown"
  const passed = sameText(mapName, "Viridian City")
  return createResult({
    confidence: passed ? 1 : 0.6,
    evidence: [`map=${mapName}`, `tile=${formatTile(state.player.tile)}`],
    kind: "benchmark_milestone",
    objectiveId: "redblue.viridian_arrival",
    status: passed ? "passed" : "in_progress",
    summary: passed ? "Player is in Viridian City." : "Player has not reached Viridian City.",
  })
}

function evaluateOakParcel(state: GameState): ObjectiveResult {
  const noRom = failWhenRomMissing("redblue.oak_parcel", "benchmark_milestone", state)
  if (noRom !== null) {
    return noRom
  }

  const parcel = state.bag.find((item) => sameText(item.name, "Oak's Parcel"))
  const hasParcelFlag = state.flags.values["got_oaks_parcel"] === true
  const passed = hasParcelFlag || parcel !== undefined
  return createResult({
    confidence: passed ? (hasParcelFlag ? 1 : 0.9) : 0.5,
    evidence: [
      `flag got_oaks_parcel=${hasParcelFlag}`,
      `bag has Oak's Parcel=${parcel !== undefined}`,
    ],
    kind: "benchmark_milestone",
    objectiveId: "redblue.oak_parcel",
    status: passed ? "passed" : "in_progress",
    summary: passed ? "Oak's Parcel evidence is present." : "Oak's Parcel evidence is absent.",
  })
}

function evaluateFirstGym(state: GameState): ObjectiveResult {
  const noRom = failWhenRomMissing("redblue.first_gym", "benchmark_milestone", state)
  if (noRom !== null) {
    return noRom
  }

  const hasBoulderBadge = state.badges.owned.some(
    (badge) => sameText(badge, "Boulder") || sameText(badge, "Boulder Badge"),
  )
  return createResult({
    confidence: hasBoulderBadge ? 1 : 0.5,
    evidence: [`badges=${state.badges.owned.length === 0 ? "none" : state.badges.owned.join(",")}`],
    kind: "benchmark_milestone",
    objectiveId: "redblue.first_gym",
    status: hasBoulderBadge ? "passed" : "in_progress",
    summary: hasBoulderBadge ? "Boulder Badge evidence is present." : "Boulder Badge not observed.",
  })
}

function failWhenRomMissing(
  objectiveId: RedBlueObjectiveId,
  kind: ObjectiveKind,
  state: GameState,
): ObjectiveResult | null {
  return state.emulator.romLoaded
    ? null
    : createResult({
        confidence: 1,
        evidence: ["romLoaded=false"],
        kind,
        objectiveId,
        status: "failed",
        summary: "Objective cannot be evaluated without a loaded ROM or fake backend state.",
      })
}

function createResult(result: ObjectiveResultInput): ObjectiveResult {
  return { ...result, type: "objective_result" }
}

function sameText(left: string | null, right: string): boolean {
  return normalizeText(left) === normalizeText(right)
}

function normalizeText(value: string | null): string {
  return value === null ? "" : value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "")
}

function formatTile(tile: GameState["player"]["tile"]): string {
  return tile === null ? "unknown" : `x=${tile.x}, y=${tile.y}`
}
