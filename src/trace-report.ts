import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import {
  type ActionQualityMetrics,
  computeActionQualityMetricsFromTraceDir,
} from "./action-quality-metrics"
import { type TraceReplayRecord, TraceReplaySchema } from "./trace-replay"
import {
  buildTimeline,
  extractObjectiveResults,
  extractScreenshotMetadata,
} from "./trace-report-extract"
import { TraceRunFileSchema, type TraceRunRecord } from "./trace-run-metadata"

const TraceEventRecordSchema = z
  .object({
    abiVersion: z.string().min(1).optional(),
    message: z.string().min(1),
    payload: z.unknown().optional(),
    schemaVersion: z.number().int().min(1).optional(),
    timestamp: z.string().min(1).optional(),
    type: z.string().min(1),
  })
  .strict()

const TraceActionRecordSchema = z
  .object({
    abiVersion: z.string().min(1).optional(),
    action: z.unknown(),
    result: z.unknown().optional(),
    schemaVersion: z.number().int().min(1).optional(),
    timestamp: z.string().min(1).optional(),
    type: z.string().min(1),
  })
  .strict()

const TraceObservationRecordSchema = z
  .object({
    abiVersion: z.string().min(1).optional(),
    frame: z.number().int().min(0).optional(),
    observation: z.unknown(),
    schemaVersion: z.number().int().min(1).optional(),
    timestamp: z.string().min(1).optional(),
    type: z.string().min(1),
  })
  .strict()

const TraceTokenUsageRecordSchema = z.looseObject({
  inputTokens: z.number().int().min(0),
  model: z.string().min(1),
  outputTokens: z.number().int().min(0),
  provider: z.string().min(1),
  timestamp: z.string().min(1).optional(),
  totalTokens: z.number().int().min(0),
  type: z.string().min(1),
})

export type TraceEventRecord = z.infer<typeof TraceEventRecordSchema>
export type TraceActionRecord = z.infer<typeof TraceActionRecordSchema>
export type TraceObservationRecord = z.infer<typeof TraceObservationRecordSchema>
type TraceTokenUsageRecord = z.infer<typeof TraceTokenUsageRecordSchema>

export type TraceObjectiveSummary = {
  readonly confidence?: number
  readonly evidence: readonly string[]
  readonly objectiveId: string
  readonly status: string
  readonly summary: string
}

export type TraceScreenshotSummary = {
  readonly frame?: number
  readonly height?: number
  readonly kind: "screenshot" | "gridScreenshot"
  readonly pngBase64Length?: number
  readonly turn?: number
  readonly width?: number
}

export type TraceTimelineItem = {
  readonly detail: string
  readonly kind: "action" | "event" | "observation"
  readonly label: string
  readonly timestamp: string
}

export type TraceReportDiff = {
  readonly actionDelta: number
  readonly eventDelta: number
  readonly observationDelta: number
  readonly runId: string
  readonly sameActionStreakDelta: number
}

export type TraceReport = {
  readonly actions: readonly TraceActionRecord[]
  readonly diff?: TraceReportDiff
  readonly events: readonly TraceEventRecord[]
  readonly metrics: ActionQualityMetrics
  readonly objectiveResults: readonly TraceObjectiveSummary[]
  readonly observations: readonly TraceObservationRecord[]
  readonly replay?: TraceReplayRecord
  readonly run: TraceRunRecord
  readonly screenshotMetadata: readonly TraceScreenshotSummary[]
  readonly timeline: readonly TraceTimelineItem[]
  readonly tokenUsage: readonly TraceTokenUsageRecord[]
  readonly traceDir: string
}

export async function loadTraceReportData(
  traceDir: string,
  options: { readonly compareTraceDir?: string } = {},
): Promise<TraceReport> {
  const report = await loadSingleTraceReport(traceDir)
  if (options.compareTraceDir === undefined) {
    return report
  }
  const compareReport = await loadSingleTraceReport(options.compareTraceDir)
  return { ...report, diff: diffTraceReports(report, compareReport) }
}

function diffTraceReports(base: TraceReport, compare: TraceReport): TraceReportDiff {
  return {
    actionDelta: base.actions.length - compare.actions.length,
    eventDelta: base.events.length - compare.events.length,
    observationDelta: base.observations.length - compare.observations.length,
    runId: compare.run.runId,
    sameActionStreakDelta: base.metrics.sameActionStreak - compare.metrics.sameActionStreak,
  }
}

async function loadSingleTraceReport(traceDir: string): Promise<TraceReport> {
  const [run, replay, events, actions, observations, tokenUsage, metrics] = await Promise.all([
    readJson(join(traceDir, "run.json"), TraceRunFileSchema),
    readOptionalJson(join(traceDir, "replay.json"), TraceReplaySchema),
    readJsonl(join(traceDir, "events.jsonl"), TraceEventRecordSchema),
    readJsonl(join(traceDir, "actions.jsonl"), TraceActionRecordSchema),
    readJsonl(join(traceDir, "observations.jsonl"), TraceObservationRecordSchema),
    readJsonl(join(traceDir, "token-usage.jsonl"), TraceTokenUsageRecordSchema),
    computeActionQualityMetricsFromTraceDir(traceDir),
  ])
  return {
    actions,
    events,
    metrics,
    objectiveResults: extractObjectiveResults(events),
    observations,
    ...(replay === undefined ? {} : { replay }),
    run,
    screenshotMetadata: extractScreenshotMetadata(observations),
    timeline: buildTimeline({ actions, events, observations }),
    tokenUsage,
    traceDir,
  }
}

async function readJson<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.output<Schema>> {
  return schema.parse(JSON.parse(await readFile(path, "utf8")))
}

async function readOptionalJson<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.output<Schema> | undefined> {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    return undefined
  }
  return readJson(path, schema)
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
