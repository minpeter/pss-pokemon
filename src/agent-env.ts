import { z } from "zod"
import {
  BackendModeSchema,
  type BackendSessionMode,
  BackendSessionModeSchema,
  parseCliArgs,
} from "./cli-args"
import { HUMAN_CONTROLLER_ID, HUMAN_MODEL_ID } from "./control-modes"
import {
  DEFAULT_ENV_FILES,
  loadDefaultEnvFiles,
  type RuntimeEnv,
  readEnvValuesFromFiles,
} from "./env-files"
import { resolveTraceConfig } from "./trace-recording"

const DEFAULT_AI_BASE_URL = "https://codex.nekos.me/v1"
const DEFAULT_BACKEND_URL = "http://127.0.0.1:8765"
const DEFAULT_BACKEND_SESSION_ROOT_DIR = ".local/backend-sessions"
const DEFAULT_CONTROLLER_ID = "agent-cli"
const DEFAULT_MODEL = "gpt-5.5"
const DEFAULT_SESSION_ID = "pokemon-agent"

const AgentEnvSchema = z.object({
  aiApiKey: z.string().min(1).optional(),
  aiBaseUrl: z.url(),
  backendMode: BackendModeSchema,
  backendSessionMode: BackendSessionModeSchema,
  backendSessionRootDir: z.string().min(1),
  backendUrl: z.url(),
  controllerId: z.string().min(1),
  modelId: z.string().min(1),
  sessionId: z.string().min(1),
  traceRootDir: z.string().min(1).optional(),
  traceRunId: z.string().min(1).optional(),
})

export type AgentEnv = z.infer<typeof AgentEnvSchema>
export type ResolvedAgentEnv = AgentEnv & {
  readonly backendRuntimeEnv: RuntimeEnv
}

export function readAgentEnv(argv: readonly string[] = process.argv.slice(2)): ResolvedAgentEnv {
  loadDefaultEnvFiles()

  return readAgentEnvFromFiles({
    argv,
    envFiles: [],
    runtimeEnv: process.env,
  })
}

export function readAgentEnvFromFiles({
  argv = [],
  envFiles = DEFAULT_ENV_FILES,
  runtimeEnv = process.env,
}: {
  readonly argv?: readonly string[]
  readonly envFiles?: readonly string[]
  readonly runtimeEnv?: RuntimeEnv
} = {}): ResolvedAgentEnv {
  const env = readEnvValuesFromFiles({ envFiles, runtimeEnv })
  const args = parseCliArgs(argv)
  const modelId = firstDefined(env, "POKEMON_AI_MODEL", "AI_MODEL") ?? DEFAULT_MODEL
  const backendUrl = env["POKEMON_BACKEND_URL"] ?? DEFAULT_BACKEND_URL
  const sessionId = env["POKEMON_AGENT_SESSION_ID"] ?? DEFAULT_SESSION_ID
  const backendSessionMode = resolveBackendSessionMode({
    argsMode: args.backendSessionMode,
    forceNewBackendSession: args.forceNewBackendSession,
    hasExplicitBackendUrl: env["POKEMON_BACKEND_URL"] !== undefined,
  })
  const traceConfig = resolveTraceConfig({
    defaultRunId: sessionId,
    rootDir: env["POKEMON_TRACE_ROOT"],
    runId: env["POKEMON_TRACE_RUN_ID"],
  })

  return {
    ...AgentEnvSchema.parse({
      aiApiKey: firstDefined(env, "POKEMON_AI_API_KEY", "AI_API_KEY"),
      aiBaseUrl: firstDefined(env, "POKEMON_AI_BASE_URL", "AI_BASE_URL") ?? DEFAULT_AI_BASE_URL,
      backendMode:
        args.backendMode ?? BackendModeSchema.parse(env["POKEMON_BACKEND_MODE"] ?? "real"),
      backendSessionMode,
      backendSessionRootDir:
        env["POKEMON_BACKEND_SESSION_ROOT"] ?? DEFAULT_BACKEND_SESSION_ROOT_DIR,
      backendUrl,
      controllerId:
        env["POKEMON_AGENT_CONTROLLER_ID"] ??
        (modelId === HUMAN_MODEL_ID ? HUMAN_CONTROLLER_ID : DEFAULT_CONTROLLER_ID),
      modelId,
      sessionId,
      ...traceConfig,
    }),
    backendRuntimeEnv: env,
  }
}

function resolveBackendSessionMode({
  argsMode,
  forceNewBackendSession,
  hasExplicitBackendUrl,
}: {
  readonly argsMode: Exclude<BackendSessionMode, "external">
  readonly forceNewBackendSession: boolean
  readonly hasExplicitBackendUrl: boolean
}): BackendSessionMode {
  if (forceNewBackendSession) {
    return "new"
  }
  if (argsMode === "new") {
    return hasExplicitBackendUrl ? "external" : "new"
  }
  return argsMode
}

function firstDefined(
  env: Readonly<Record<string, string | undefined>>,
  primary: string,
  fallback: string,
): string | undefined {
  return env[primary] ?? env[fallback]
}
