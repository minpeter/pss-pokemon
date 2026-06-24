import { ObjectiveResultSchema } from "./objective-registry"
import type {
  TraceActionRecord,
  TraceEventRecord,
  TraceObjectiveSummary,
  TraceObservationRecord,
  TraceScreenshotSummary,
  TraceTimelineItem,
} from "./trace-report"

export function extractObjectiveResults(
  events: readonly TraceEventRecord[],
): readonly TraceObjectiveSummary[] {
  return events.flatMap((event) => {
    const payload = asObject(event.payload)
    const candidates = [
      event.payload,
      payload?.["objectiveResult"],
      payload?.["result"],
      payload?.["example"],
    ]
    for (const candidate of candidates) {
      const parsed = ObjectiveResultSchema.safeParse(candidate)
      if (parsed.success) {
        return [
          {
            confidence: parsed.data.confidence,
            evidence: parsed.data.evidence,
            objectiveId: parsed.data.objectiveId,
            status: parsed.data.status,
            summary: parsed.data.summary,
          },
        ]
      }
    }
    return []
  })
}

export function extractScreenshotMetadata(
  observations: readonly TraceObservationRecord[],
): readonly TraceScreenshotSummary[] {
  return observations.flatMap((record) => {
    const observation = asObject(record.observation)
    const turn = numberField(observation, "turn")
    return (["screenshot", "gridScreenshot"] as const).flatMap((kind) => {
      const metadata = asObject(observation?.[kind])
      if (metadata === null) {
        return []
      }
      const frame = numberField(metadata, "frame") ?? record.frame
      const height = numberField(metadata, "height")
      const pngBase64Length = numberField(metadata, "pngBase64Length")
      const width = numberField(metadata, "width")
      return [
        createScreenshotSummary({
          ...(frame === undefined ? {} : { frame }),
          ...(height === undefined ? {} : { height }),
          kind,
          ...(pngBase64Length === undefined ? {} : { pngBase64Length }),
          ...(turn === undefined ? {} : { turn }),
          ...(width === undefined ? {} : { width }),
        }),
      ]
    })
  })
}

export function buildTimeline({
  actions,
  events,
  observations,
}: {
  readonly actions: readonly TraceActionRecord[]
  readonly events: readonly TraceEventRecord[]
  readonly observations: readonly TraceObservationRecord[]
}): readonly TraceTimelineItem[] {
  return [
    ...observations.map((record) => ({
      detail: summarizeObservation(record),
      kind: "observation" as const,
      label: record.type,
      timestamp: record.timestamp ?? "",
    })),
    ...actions.map((record) => ({
      detail: summarizeValue(record.action),
      kind: "action" as const,
      label: record.type,
      timestamp: record.timestamp ?? "",
    })),
    ...events.map((record) => ({
      detail: record.message,
      kind: "event" as const,
      label: record.type,
      timestamp: record.timestamp ?? "",
    })),
  ].sort((left, right) => left.timestamp.localeCompare(right.timestamp))
}

function summarizeObservation(record: TraceObservationRecord): string {
  const observation = asObject(record.observation)
  const map = asObject(observation?.["map"])
  const player = asObject(observation?.["player"])
  return `frame=${record.frame ?? "unknown"} map=${stringField(map, "name") ?? "unknown"} player=${stringField(player, "tile") ?? "unknown"}`
}

function summarizeValue(value: unknown): string {
  const text = JSON.stringify(value)
  return text.length > 160 ? `${text.slice(0, 157)}...` : text
}

function asObject(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null
}

function createScreenshotSummary(value: TraceScreenshotSummary): TraceScreenshotSummary {
  return value
}

function numberField(
  object: Readonly<Record<string, unknown>> | null,
  key: string,
): number | undefined {
  const value = object?.[key]
  return typeof value === "number" ? value : undefined
}

function stringField(
  object: Readonly<Record<string, unknown>> | null,
  key: string,
): string | undefined {
  const value = object?.[key]
  return typeof value === "string" ? value : undefined
}
