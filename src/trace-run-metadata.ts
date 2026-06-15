import { z } from "zod"
import type { PreparedBackendSession } from "./backend-session-types"
import type { BackendMode } from "./cli-args"
import { HUMAN_MODEL_ID } from "./control-modes"
import type { RedBlueObjectiveId } from "./objective-registry"
import {
  type BackendKind,
  type ControllerMode,
  createUnknownRomIdentity,
  type HarnessRunMetadata,
  HarnessRunMetadataSchema,
  type PrivilegeLevel,
  type RomIdentity,
  type SelfImprovementMode,
} from "./privilege-ladder"
import { TRACE_ABI_VERSION, TRACE_SCHEMA_VERSION } from "./trace-abi"

const DEFAULT_OBJECTIVE_ID: RedBlueObjectiveId = "redblue.pallet_fake_smoke"
const DEFAULT_PRIVILEGE_LEVEL: PrivilegeLevel = "ram_lite"
const DEFAULT_SELF_IMPROVEMENT_MODE: SelfImprovementMode = "none"
const DEFAULT_TEMPERATURE = 0

export const TraceRunFileSchema = z
  .object({
    abiVersion: z.literal(TRACE_ABI_VERSION),
    metadata: HarnessRunMetadataSchema,
    runId: z.string().min(1),
    schemaVersion: z.literal(TRACE_SCHEMA_VERSION),
    timestamp: z.string().min(1),
    type: z.literal("run"),
  })
  .strict()

export type TraceRunRecord = z.infer<typeof TraceRunFileSchema>

export type CreateTraceRunMetadataInput = {
  readonly backend: PreparedBackendSession
  readonly backendMode: BackendMode
  readonly controllerMode: ControllerMode
  readonly modelId: string
  readonly modelProvider?: string
  readonly objectiveId?: RedBlueObjectiveId
  readonly privilegeLevel?: PrivilegeLevel
  readonly selfImprovementMode?: SelfImprovementMode
  readonly temperature?: number
}

export function createDefaultTraceRunMetadata(): HarnessRunMetadata {
  return HarnessRunMetadataSchema.parse({
    backendKind: "pyboy_fake",
    controllerMode: "llm_macro_deterministic_micro",
    model: { id: "test-harness" },
    objectiveId: DEFAULT_OBJECTIVE_ID,
    privilegeLevel: DEFAULT_PRIVILEGE_LEVEL,
    romIdentity: createUnknownRomIdentity("default fake trace metadata has no ROM"),
    selfImprovementMode: DEFAULT_SELF_IMPROVEMENT_MODE,
    temperature: DEFAULT_TEMPERATURE,
    type: "harness_run_metadata",
  })
}

export function createAgentTraceRunMetadata({
  backend,
  backendMode,
  modelId,
}: {
  readonly backend: PreparedBackendSession
  readonly backendMode: BackendMode
  readonly modelId: string
}): HarnessRunMetadata {
  return createTraceRunMetadata({
    backend,
    backendMode,
    controllerMode:
      modelId === HUMAN_MODEL_ID ? "deterministic_only" : "llm_macro_deterministic_micro",
    modelId,
  })
}

export function createHumanTraceRunMetadata({
  backend,
  backendMode,
}: {
  readonly backend: PreparedBackendSession
  readonly backendMode: BackendMode
}): HarnessRunMetadata {
  return createTraceRunMetadata({
    backend,
    backendMode,
    controllerMode: "deterministic_only",
    modelId: HUMAN_MODEL_ID,
  })
}

export function createTraceRunMetadata(input: CreateTraceRunMetadataInput): HarnessRunMetadata {
  const backendKind = resolveBackendKind(input.backend, input.backendMode)
  return HarnessRunMetadataSchema.parse({
    backendKind,
    controllerMode: input.controllerMode,
    model: {
      id: input.modelId,
      ...(input.modelProvider === undefined ? {} : { provider: input.modelProvider }),
    },
    objectiveId: input.objectiveId ?? DEFAULT_OBJECTIVE_ID,
    privilegeLevel: input.privilegeLevel ?? DEFAULT_PRIVILEGE_LEVEL,
    romIdentity: resolveRomIdentity(input.backend, backendKind),
    selfImprovementMode: input.selfImprovementMode ?? DEFAULT_SELF_IMPROVEMENT_MODE,
    temperature: input.temperature ?? DEFAULT_TEMPERATURE,
    type: "harness_run_metadata",
  })
}

export function parseTraceRunMetadata(input: unknown): HarnessRunMetadata {
  return HarnessRunMetadataSchema.parse(input)
}

function resolveBackendKind(
  backend: PreparedBackendSession,
  backendMode: BackendMode,
): BackendKind {
  switch (backend.source) {
    case "external":
      return backendModeToKind(backendMode)
    case "new":
    case "resume":
      return backendModeToKind(backend.session.mode)
    default:
      return assertNever(backend)
  }
}

function backendModeToKind(mode: BackendMode): BackendKind {
  switch (mode) {
    case "fake":
      return "pyboy_fake"
    case "real":
      return "pyboy_real"
    default:
      return assertNever(mode)
  }
}

function resolveRomIdentity(
  backend: PreparedBackendSession,
  backendKind: BackendKind,
): RomIdentity {
  if (backend.source === "external") {
    return createUnknownRomIdentity("external backend does not expose ROM identity to CLI traces")
  }
  switch (backendKind) {
    case "pyboy_fake":
      return createUnknownRomIdentity("pyboy fake backend smoke run has no ROM")
    case "pyboy_real":
      return createUnknownRomIdentity("managed pyboy real backend ROM hash is not recorded")
    case "mgba_http":
      return createUnknownRomIdentity("mGBA backend ROM identity is unavailable to CLI traces")
    case "pokeagent":
      return createUnknownRomIdentity("PokeAgent backend ROM identity is unavailable to CLI traces")
    default:
      return assertNever(backendKind)
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled trace run metadata value: ${JSON.stringify(value)}`)
}
