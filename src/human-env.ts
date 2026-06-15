import { z } from "zod"
import {
  BackendModeSchema,
  type BackendSessionMode,
  BackendSessionModeSchema,
  parseCliArgs,
} from "./cli-args"
import { DEFAULT_ENV_FILES, type RuntimeEnv, readEnvValuesFromFiles } from "./env-files"
import { resolveTraceConfig } from "./trace-recording"

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8765"
const DEFAULT_BACKEND_SESSION_ROOT_DIR = ".local/backend-sessions"
const DEFAULT_TRACE_RUN_ID = "human-cli"

const HumanEnvSchema = z.object({
  backendMode: BackendModeSchema,
  backendSessionMode: BackendSessionModeSchema,
  backendSessionRootDir: z.string().min(1),
  backendUrl: z.url(),
  traceRootDir: z.string().min(1).optional(),
  traceRunId: z.string().min(1).optional(),
})

export type HumanEnv = z.infer<typeof HumanEnvSchema>
export type ResolvedHumanEnv = HumanEnv & {
  readonly backendRuntimeEnv: RuntimeEnv
}

export function readHumanEnv(argv: readonly string[] = process.argv.slice(2)): ResolvedHumanEnv {
  return readHumanEnvFromFiles({ argv })
}

export function readHumanEnvFromFiles({
  argv = [],
  envFiles = DEFAULT_ENV_FILES,
  runtimeEnv = process.env,
}: {
  readonly argv?: readonly string[]
  readonly envFiles?: readonly string[]
  readonly runtimeEnv?: RuntimeEnv
} = {}): ResolvedHumanEnv {
  const env = readEnvValuesFromFiles({ envFiles, runtimeEnv })
  const args = parseCliArgs(argv)
  const backendUrl = env["POKEMON_BACKEND_URL"] ?? DEFAULT_BACKEND_URL
  const backendSessionMode = resolveBackendSessionMode({
    argsMode: args.backendSessionMode,
    forceNewBackendSession: args.forceNewBackendSession,
    hasExplicitBackendUrl: env["POKEMON_BACKEND_URL"] !== undefined,
  })
  const traceConfig = resolveTraceConfig({
    defaultRunId: DEFAULT_TRACE_RUN_ID,
    rootDir: env["POKEMON_TRACE_ROOT"],
    runId: env["POKEMON_TRACE_RUN_ID"],
  })

  return {
    ...HumanEnvSchema.parse({
      backendMode:
        args.backendMode ?? BackendModeSchema.parse(env["POKEMON_BACKEND_MODE"] ?? "real"),
      backendSessionMode,
      backendSessionRootDir:
        env["POKEMON_BACKEND_SESSION_ROOT"] ?? DEFAULT_BACKEND_SESSION_ROOT_DIR,
      backendUrl,
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
