import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"

const VerificationSchema = z.object({
  battleChanged: z.boolean().optional(),
  dialogChanged: z.boolean().optional(),
  frameAdvanced: z.boolean().optional(),
  moved: z.boolean().optional(),
  stateChanged: z.boolean().optional(),
})

const ActionRecordSchema = z.object({
  action: z.unknown(),
  result: z
    .object({
      accepted: z.boolean().optional(),
      supervisorInterventions: z.number().int().min(0).optional(),
      turn: z.number().int().min(0).optional(),
      verification: VerificationSchema.optional(),
    })
    .optional(),
  type: z.string().min(1),
})

const ObservationRecordSchema = z.object({
  frame: z.number().int().min(0).optional(),
  observation: z.unknown(),
  type: z.string().min(1),
})

export const ActionQualityMetricsSchema = z
  .object({
    actionEntropy: z.number().min(0),
    noProgressStreak: z.number().int().min(0),
    observeBeforeActRatio: z.number().min(0).max(1),
    sameActionStreak: z.number().int().min(0),
    supervisorInterventions: z.number().int().min(0),
    toolErrorRate: z.number().min(0).max(1),
    totalActions: z.number().int().min(0),
    totalObservations: z.number().int().min(0),
    visualStateNovelty: z.number().min(0).max(1),
  })
  .strict()

type ActionRecord = z.infer<typeof ActionRecordSchema>
type ObservationRecord = z.infer<typeof ObservationRecordSchema>
export type ActionQualityMetrics = z.infer<typeof ActionQualityMetricsSchema>

export async function computeActionQualityMetricsFromTraceDir(
  traceDir: string,
): Promise<ActionQualityMetrics> {
  const actions = await readJsonl(join(traceDir, "actions.jsonl"), ActionRecordSchema)
  const observations = await readJsonl(
    join(traceDir, "observations.jsonl"),
    ObservationRecordSchema,
  )
  return computeActionQualityMetrics({ actions, observations })
}

export function computeActionQualityMetrics({
  actions,
  observations,
}: {
  readonly actions: readonly ActionRecord[]
  readonly observations: readonly ObservationRecord[]
}): ActionQualityMetrics {
  const actionSignatures = actions.map((record) => stableStringify(record.action))
  const totalActions = actions.length
  const totalObservations = observations.length
  return ActionQualityMetricsSchema.parse({
    actionEntropy: entropy(actionSignatures),
    noProgressStreak: longestStreak(actions.map(isNoProgressAction)),
    observeBeforeActRatio: observeBeforeActRatio(actions, observations),
    sameActionStreak: longestSameValueStreak(actionSignatures),
    supervisorInterventions: actions.reduce(
      (sum, record) => sum + (record.result?.supervisorInterventions ?? 0),
      0,
    ),
    toolErrorRate:
      totalActions === 0
        ? 0
        : actions.filter((record) => record.result?.accepted === false).length / totalActions,
    totalActions,
    totalObservations,
    visualStateNovelty: noveltyRatio(observations.map(observationNoveltySignature)),
  })
}

async function readJsonl<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<readonly z.output<Schema>[]> {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    return []
  }
  const text = await readFile(path, "utf8")
  if (text.trim().length === 0) {
    return []
  }
  return text
    .trimEnd()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => schema.parse(JSON.parse(line)))
}

function isNoProgressAction(record: ActionRecord): boolean {
  const verification = record.result?.verification
  if (verification === undefined) {
    return false
  }
  return (
    verification.moved !== true &&
    verification.dialogChanged !== true &&
    verification.battleChanged !== true
  )
}

function observeBeforeActRatio(
  actions: readonly ActionRecord[],
  observations: readonly ObservationRecord[],
): number {
  if (actions.length === 0) {
    return 1
  }
  const observedTurns = new Set<number>()
  for (const record of observations) {
    const turn = observationTurn(record)
    if (turn !== null) {
      observedTurns.add(turn)
    }
  }
  const coveredActions = actions.filter((record) => {
    const turn = record.result?.turn
    return turn !== undefined && observedTurns.has(turn)
  })
  return coveredActions.length / actions.length
}

function observationTurn(record: ObservationRecord): number | null {
  const parsed = z.object({ turn: z.number().int().min(0) }).safeParse(record.observation)
  return parsed.success ? parsed.data.turn : null
}

function longestSameValueStreak(values: readonly string[]): number {
  let longest = 0
  let current = 0
  let previous: string | null = null
  for (const value of values) {
    current = value === previous ? current + 1 : 1
    previous = value
    longest = Math.max(longest, current)
  }
  return longest
}

function longestStreak(values: readonly boolean[]): number {
  let longest = 0
  let current = 0
  for (const value of values) {
    current = value ? current + 1 : 0
    longest = Math.max(longest, current)
  }
  return longest
}

function entropy(values: readonly string[]): number {
  if (values.length === 0) {
    return 0
  }
  const counts = valueCounts(values)
  return Array.from(counts.values()).reduce((sum, count) => {
    const probability = count / values.length
    return sum - probability * Math.log2(probability)
  }, 0)
}

function noveltyRatio(values: readonly string[]): number {
  return values.length === 0 ? 0 : new Set(values).size / values.length
}

function observationNoveltySignature(record: ObservationRecord): string {
  return stableStringify(removeVolatileObservationKeys(record.observation))
}

function valueCounts(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value))
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue)
  }
  if (value === null || typeof value !== "object") {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJsonValue(child)]),
  )
}

function removeVolatileObservationKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeVolatileObservationKeys)
  }
  if (value === null || typeof value !== "object") {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "turn" && key !== "timestamp" && key !== "frame")
      .map(([key, child]) => [key, removeVolatileObservationKeys(child)]),
  )
}
