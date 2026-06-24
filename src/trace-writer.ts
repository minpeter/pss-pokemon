import { appendFile, mkdir, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { TRACE_ABI_VERSION, TRACE_SCHEMA_VERSION } from "./trace-abi"
import type {
  TraceActionInput,
  TraceClock,
  TraceEventInput,
  TraceJsonObject,
  TraceJsonValue,
  TraceObservationInput,
  TraceTokenUsageInput,
  TraceWriter,
  TraceWriterOptions,
} from "./trace-record-types"
import { createTraceReplayRecord } from "./trace-replay"
import {
  createDefaultTraceRunMetadata,
  parseTraceRunMetadata,
  type TraceRunRecord,
} from "./trace-run-metadata"

export { TRACE_ABI_VERSION, TRACE_SCHEMA_VERSION } from "./trace-abi"
export type {
  TraceActionInput,
  TraceClock,
  TraceEventInput,
  TraceJsonObject,
  TraceJsonValue,
  TraceObservationInput,
  TraceTokenUsageInput,
  TraceWriter,
  TraceWriterOptions,
} from "./trace-record-types"

const RUN_FILE = "run.json"
const REPLAY_FILE = "replay.json"
const EVENTS_FILE = "events.jsonl"
const ACTIONS_FILE = "actions.jsonl"
const OBSERVATIONS_FILE = "observations.jsonl"
const TOKEN_USAGE_FILE = "token-usage.jsonl"

type TraceEventRecord = {
  readonly abiVersion: typeof TRACE_ABI_VERSION
  readonly schemaVersion: typeof TRACE_SCHEMA_VERSION
  readonly type: string
  readonly timestamp: string
  readonly message: string
  readonly payload?: TraceJsonObject
}

type TraceActionRecord = {
  readonly abiVersion: typeof TRACE_ABI_VERSION
  readonly schemaVersion: typeof TRACE_SCHEMA_VERSION
  readonly type: string
  readonly timestamp: string
  readonly action: TraceJsonValue
  readonly result?: TraceJsonObject
}

type TraceObservationRecord = {
  readonly abiVersion: typeof TRACE_ABI_VERSION
  readonly schemaVersion: typeof TRACE_SCHEMA_VERSION
  readonly type: string
  readonly timestamp: string
  readonly frame?: number
  readonly observation: TraceJsonObject
}

type TraceTokenUsageRecord = {
  readonly abiVersion: typeof TRACE_ABI_VERSION
  readonly schemaVersion: typeof TRACE_SCHEMA_VERSION
  readonly type: string
  readonly timestamp: string
  readonly provider: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
  readonly payload?: TraceJsonObject
}

export class TraceRunIdError extends Error {
  readonly name = "TraceRunIdError"

  constructor(readonly runId: string) {
    super(`trace run id must be a safe single path segment: ${runId}`)
  }
}

export class TracePathEscapeError extends Error {
  readonly name = "TracePathEscapeError"

  constructor(
    readonly rootDir: string,
    readonly runDir: string,
  ) {
    super(`trace run directory escaped root: ${runDir}`)
  }
}

export async function createTraceWriter(options: TraceWriterOptions): Promise<TraceWriter> {
  const clock = options.clock ?? (() => new Date())
  const runDir = resolveRunDir(options.rootDir, options.runId)
  const metadata = parseTraceRunMetadata(options.metadata ?? createDefaultTraceRunMetadata())
  const startedAt = timestamp(clock)
  await mkdir(runDir, { recursive: true })
  await writeRunFile({
    metadata,
    runDir,
    runId: options.runId,
    timestamp: startedAt,
  })
  await writeReplayFile({
    metadata,
    runDir,
    runId: options.runId,
    timestamp: startedAt,
  })
  return {
    runDir,
    runId: options.runId,
    appendAction: (input) =>
      appendJsonl(join(runDir, ACTIONS_FILE), createActionRecord(input, clock)),
    appendEvent: (input) => appendJsonl(join(runDir, EVENTS_FILE), createEventRecord(input, clock)),
    appendObservation: (input) =>
      appendJsonl(join(runDir, OBSERVATIONS_FILE), createObservationRecord(input, clock)),
    appendTokenUsage: (input) =>
      appendJsonl(join(runDir, TOKEN_USAGE_FILE), createTokenUsageRecord(input, clock)),
  }
}

function resolveRunDir(rootDir: string, runId: string): string {
  if (!isSafeTraceRunId(runId)) {
    throw new TraceRunIdError(runId)
  }
  const resolvedRootDir = resolve(rootDir)
  const runDir = resolve(resolvedRootDir, runId)
  if (!isPathInside(runDir, resolvedRootDir)) {
    throw new TracePathEscapeError(resolvedRootDir, runDir)
  }
  return runDir
}

export function isSafeTraceRunId(runId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId) && !isAbsolute(runId)
}

function isPathInside(path: string, rootDir: string): boolean {
  const relativePath = relative(rootDir, path)
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  )
}

async function writeRunFile({
  metadata,
  runDir,
  runId,
  timestamp,
}: {
  readonly metadata: TraceRunRecord["metadata"]
  readonly runDir: string
  readonly runId: string
  readonly timestamp: string
}): Promise<void> {
  const record = {
    abiVersion: TRACE_ABI_VERSION,
    schemaVersion: TRACE_SCHEMA_VERSION,
    type: "run",
    timestamp,
    runId,
    metadata,
  } satisfies TraceRunRecord
  await writeFile(join(runDir, RUN_FILE), `${JSON.stringify(record, null, 2)}\n`, "utf8")
}

async function writeReplayFile({
  metadata,
  runDir,
  runId,
  timestamp,
}: {
  readonly metadata: TraceRunRecord["metadata"]
  readonly runDir: string
  readonly runId: string
  readonly timestamp: string
}): Promise<void> {
  const record = createTraceReplayRecord({
    events: [],
    metadata,
    replayId: runId,
    runId,
    timestamp,
  })
  await writeFile(join(runDir, REPLAY_FILE), `${JSON.stringify(record, null, 2)}\n`, "utf8")
}

async function appendJsonl(path: string, record: TraceJsonObject): Promise<void> {
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8")
}

function createEventRecord(input: TraceEventInput, clock: TraceClock): TraceEventRecord {
  return {
    abiVersion: TRACE_ABI_VERSION,
    schemaVersion: TRACE_SCHEMA_VERSION,
    type: input.type,
    timestamp: timestamp(clock),
    message: input.message,
    ...(input.payload === undefined ? {} : { payload: input.payload }),
  }
}

function createActionRecord(input: TraceActionInput, clock: TraceClock): TraceActionRecord {
  return {
    abiVersion: TRACE_ABI_VERSION,
    schemaVersion: TRACE_SCHEMA_VERSION,
    type: input.type,
    timestamp: timestamp(clock),
    action: input.action,
    ...(input.result === undefined ? {} : { result: input.result }),
  }
}

function createObservationRecord(
  input: TraceObservationInput,
  clock: TraceClock,
): TraceObservationRecord {
  return {
    abiVersion: TRACE_ABI_VERSION,
    schemaVersion: TRACE_SCHEMA_VERSION,
    type: input.type,
    timestamp: timestamp(clock),
    ...(input.frame === undefined ? {} : { frame: input.frame }),
    observation: input.observation,
  }
}

function createTokenUsageRecord(
  input: TraceTokenUsageInput,
  clock: TraceClock,
): TraceTokenUsageRecord {
  return {
    abiVersion: TRACE_ABI_VERSION,
    schemaVersion: TRACE_SCHEMA_VERSION,
    type: input.type,
    timestamp: timestamp(clock),
    provider: input.provider,
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.totalTokens,
    ...(input.payload === undefined ? {} : { payload: input.payload }),
  }
}

function timestamp(clock: TraceClock): string {
  return clock().toISOString()
}
