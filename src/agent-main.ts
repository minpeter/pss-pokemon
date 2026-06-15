import type { RuntimeLlm } from "@minpeter/pss-runtime"
import { type ResolvedAgentEnv, readAgentEnvFromFiles } from "./agent-env"
import { AgentRunError, runAgentControlPlane } from "./agent-runtime"
import { AgentTerminalView } from "./agent-terminal-view"
import {
  type PrepareBackendSessionOptions,
  type PreparedBackendSession,
  prepareBackendSession,
  selectBackendSessionInteractively,
} from "./backend-session-manager"
import { HUMAN_MODEL_ID } from "./control-modes"
import type { RuntimeEnv } from "./env-files"
import { runHumanControlPlane } from "./human-control-plane"
import { createOptionalTraceWriter } from "./trace-recording"
import { createAgentTraceRunMetadata } from "./trace-run-metadata"

export async function main(): Promise<void> {
  await runAgentMain()
}

export type AgentMainOptions = {
  readonly argv?: readonly string[]
  readonly env?: ResolvedAgentEnv
  readonly envFiles?: readonly string[]
  readonly llm?: RuntimeLlm
  readonly prepareSession?: (
    options: PrepareBackendSessionOptions,
  ) => Promise<PreparedBackendSession>
  readonly runAgentPlane?: typeof runAgentControlPlane
  readonly runHumanPlane?: typeof runHumanControlPlane
  readonly runtimeEnv?: RuntimeEnv
  readonly view?: AgentTerminalView
  readonly writeError?: (line: string) => void
  readonly writeStatus?: (line: string) => void
}

export async function runAgentMain({
  argv = process.argv.slice(2),
  envFiles,
  env: providedEnv,
  llm,
  prepareSession = prepareBackendSession,
  runAgentPlane = runAgentControlPlane,
  runHumanPlane = runHumanControlPlane,
  runtimeEnv = process.env,
  view = new AgentTerminalView(),
  writeError = (line) => {
    process.stderr.write(`${line}\n`)
  },
  writeStatus = (line) => {
    process.stdout.write(`${line}\n`)
  },
}: AgentMainOptions = {}): Promise<void> {
  const env =
    providedEnv ??
    readAgentEnvFromFiles({
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
    metadata: createAgentTraceRunMetadata({
      backend,
      backendMode: env.backendMode,
      modelId: env.modelId,
    }),
    rootDir: env.traceRootDir,
    runId: env.traceRunId,
  })
  try {
    if (env.modelId === HUMAN_MODEL_ID) {
      await runHumanPlane({
        backendUrl: backend.backendUrl,
        controllerId: env.controllerId,
        ...(traceWriter === undefined ? {} : { traceWriter }),
        view,
      })
      return
    }
    await runAgentPlane({
      ...(env.aiApiKey === undefined ? {} : { aiApiKey: env.aiApiKey }),
      aiBaseUrl: env.aiBaseUrl,
      backendUrl: backend.backendUrl,
      controllerId: env.controllerId,
      ...(llm === undefined ? {} : { llm }),
      modelId: env.modelId,
      onEvent: (event) => {
        view.handleEvent(event)
      },
      onActionObservation: async (observation, turn) => {
        await view.showActionObservation(observation, turn)
      },
      onObservation: async (observation, turn) => {
        await view.showObservation(observation, turn)
      },
      onStatus: (status) => {
        switch (status.type) {
          case "idle":
            view.stopSpinner()
            return
          case "loading":
            view.startSpinner(status.message)
            return
        }
      },
      sessionId: env.sessionId,
      ...(traceWriter === undefined ? {} : { traceWriter }),
    })
  } catch (error) {
    view.stopSpinner()
    if (error instanceof AgentRunError) {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
      return
    }
    throw error
  }
}

async function prepareBackendSessionOrExit({
  env,
  prepareSession,
  writeError,
}: {
  readonly env: ResolvedAgentEnv
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
