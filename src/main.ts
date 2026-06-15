import {
  type PrepareBackendSessionOptions,
  type PreparedBackendSession,
  prepareBackendSession,
  selectBackendSessionInteractively,
} from "./backend-session-manager"
import type { RuntimeEnv } from "./env-files"
import { runHumanControlPlane } from "./human-control-plane"
import { type ResolvedHumanEnv, readHumanEnvFromFiles } from "./human-env"
import { createOptionalTraceWriter } from "./trace-recording"
import { createHumanTraceRunMetadata } from "./trace-run-metadata"

export async function main(): Promise<void> {
  await runHumanMain()
}

export type HumanMainOptions = {
  readonly argv?: readonly string[]
  readonly env?: ResolvedHumanEnv
  readonly envFiles?: readonly string[]
  readonly prepareSession?: (
    options: PrepareBackendSessionOptions,
  ) => Promise<PreparedBackendSession>
  readonly runControlPlane?: typeof runHumanControlPlane
  readonly runtimeEnv?: RuntimeEnv
  readonly writeError?: (line: string) => void
  readonly writeStatus?: (line: string) => void
}

export async function runHumanMain({
  argv = process.argv.slice(2),
  envFiles,
  env: providedEnv,
  prepareSession = prepareBackendSession,
  runControlPlane = runHumanControlPlane,
  runtimeEnv = process.env,
  writeError = (line) => {
    process.stderr.write(`${line}\n`)
  },
  writeStatus = (line) => {
    process.stdout.write(`${line}\n`)
  },
}: HumanMainOptions = {}): Promise<void> {
  const env =
    providedEnv ??
    readHumanEnvFromFiles({
      argv,
      ...(envFiles === undefined ? {} : { envFiles }),
      runtimeEnv,
    })
  const backend = await prepareBackendSessionOrExit({
    env,
    prepareSession,
    writeError,
  })
  if (backend === undefined) {
    return
  }
  if (backend.source !== "external") {
    writeStatus(formatBackendSessionStatus(backend))
  }
  const traceWriter = await createOptionalTraceWriter({
    metadata: createHumanTraceRunMetadata({
      backend,
      backendMode: env.backendMode,
    }),
    rootDir: env.traceRootDir,
    runId: env.traceRunId,
  })
  await runControlPlane({
    backendUrl: backend.backendUrl,
    ...(traceWriter === undefined ? {} : { traceWriter }),
  })
}

async function prepareBackendSessionOrExit({
  env,
  prepareSession,
  writeError,
}: {
  readonly env: ResolvedHumanEnv
  readonly prepareSession: (
    options: PrepareBackendSessionOptions,
  ) => Promise<PreparedBackendSession>
  readonly writeError: (line: string) => void
}): Promise<PreparedBackendSession | undefined> {
  try {
    return await prepareSession({
      backendMode: env.backendMode,
      externalBackendUrl: env.backendUrl,
      launchMode: env.backendSessionMode,
      registryRootDir: env.backendSessionRootDir,
      runtimeEnv: env.backendRuntimeEnv,
      sessionSelector: selectBackendSessionInteractively,
    })
  } catch (error) {
    if (error instanceof Error) {
      writeError(error.message)
      process.exitCode = 1
      return undefined
    }
    throw error
  }
}

function formatBackendSessionStatus(
  backend: Extract<PreparedBackendSession, { readonly source: "new" | "resume" }>,
): string {
  return `Backend session ${backend.session.id} ${backend.backendUrl}`
}

if (import.meta.main) {
  await main()
}
