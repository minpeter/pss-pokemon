import { z } from "zod"
import { type HarnessRunMetadata, HarnessRunMetadataSchema } from "./privilege-ladder"
import { TRACE_ABI_VERSION, TRACE_SCHEMA_VERSION } from "./trace-abi"

export const TraceReplayEventSchema = z
  .object({
    atFrame: z.number().int().min(0).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.string().min(1).optional(),
    type: z.string().min(1),
  })
  .strict()

export const TraceReplaySchema = z
  .object({
    abiVersion: z.literal(TRACE_ABI_VERSION),
    events: z.array(TraceReplayEventSchema),
    metadata: HarnessRunMetadataSchema,
    replayId: z.string().min(1),
    runId: z.string().min(1),
    schemaVersion: z.literal(TRACE_SCHEMA_VERSION),
    timestamp: z.string().min(1),
    type: z.literal("replay"),
  })
  .strict()

export type TraceReplayEvent = z.infer<typeof TraceReplayEventSchema>
export type TraceReplayRecord = z.infer<typeof TraceReplaySchema>

export function createTraceReplayRecord({
  events,
  metadata,
  replayId,
  runId,
  timestamp,
}: {
  readonly events: readonly TraceReplayEvent[]
  readonly metadata: HarnessRunMetadata
  readonly replayId: string
  readonly runId: string
  readonly timestamp: string
}): TraceReplayRecord {
  return TraceReplaySchema.parse({
    abiVersion: TRACE_ABI_VERSION,
    events,
    metadata,
    replayId,
    runId,
    schemaVersion: TRACE_SCHEMA_VERSION,
    timestamp,
    type: "replay",
  })
}
