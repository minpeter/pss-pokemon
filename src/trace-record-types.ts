export type TraceJsonValue =
  | string
  | number
  | boolean
  | null
  | TraceJsonObject
  | readonly TraceJsonValue[]

export type TraceJsonObject = {
  readonly [key: string]: TraceJsonValue
}

export type TraceClock = () => Date

export type TraceWriterOptions = {
  readonly rootDir: string
  readonly runId: string
  readonly metadata?: unknown
  readonly clock?: TraceClock
}

export type TraceEventInput = {
  readonly type: string
  readonly message: string
  readonly payload?: TraceJsonObject
}

export type TraceActionInput = {
  readonly type: string
  readonly action: TraceJsonValue
  readonly result?: TraceJsonObject
}

export type TraceObservationInput = {
  readonly type: string
  readonly frame?: number
  readonly observation: TraceJsonObject
}

export type TraceTokenUsageInput = {
  readonly type: string
  readonly provider: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
  readonly payload?: TraceJsonObject
}

export interface TraceWriter {
  readonly runDir: string
  readonly runId: string
  appendAction(input: TraceActionInput): Promise<void>
  appendEvent(input: TraceEventInput): Promise<void>
  appendObservation(input: TraceObservationInput): Promise<void>
  appendTokenUsage(input: TraceTokenUsageInput): Promise<void>
}
