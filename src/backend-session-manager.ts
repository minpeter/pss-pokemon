import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import {
  MissingExternalBackendUrlError,
  NoRunningBackendSessionsError,
} from "./backend-session-errors"
import {
  DEFAULT_HOST,
  DEFAULT_STARTUP_TIMEOUT_MS,
  defaultBackendSessionRootDir,
  defaultRepoRootDir,
} from "./backend-session-paths"
import {
  allocateBackendPort,
  assertCanStartManagedBackend,
  backendCommand,
  backendEnv,
  createSessionId,
  defaultHealthProbe,
  defaultPidProbe,
  defaultProcessStopper,
  spawnBackendProcess,
  waitForBackendHealth,
} from "./backend-session-process"
import {
  appendSession,
  pruneStaleSessionIds,
  readRegistry,
  stopRegisteredSession,
} from "./backend-session-registry"
import { selectFirstSession } from "./backend-session-selection"
import type {
  BackendSessionRecord,
  HealthProbe,
  PidProbe,
  PrepareBackendSessionOptions,
  PreparedBackendSession,
  ProcessStopper,
} from "./backend-session-types"

export {
  BackendStartupTimeoutError,
  MissingExternalBackendUrlError,
  MissingRealRomPathError,
  NoRunningBackendSessionsError,
  PortAllocationError,
  RegistryLockTimeoutError,
  UnsafeProcessStopError,
} from "./backend-session-errors"
export { defaultBackendSessionRootDir, defaultRepoRootDir } from "./backend-session-paths"
export { selectBackendSessionInteractively } from "./backend-session-selection"
export type {
  BackendSessionRecord,
  Clock,
  HealthProbe,
  PidProbe,
  PortAllocator,
  PrepareBackendSessionOptions,
  PreparedBackendSession,
  ProcessSpawner,
  ProcessSpawnRequest,
  ProcessSpawnResult,
  ProcessStopper,
  SessionSelector,
} from "./backend-session-types"

export async function prepareBackendSession({
  backendMode,
  clock = () => new Date(),
  externalBackendUrl,
  healthProbe = defaultHealthProbe,
  launchMode,
  pidProbe = defaultPidProbe,
  portAllocator = allocateBackendPort,
  processSpawner = spawnBackendProcess,
  registryRootDir = defaultBackendSessionRootDir(),
  repoRootDir = defaultRepoRootDir(),
  runtimeEnv,
  sessionSelector = selectFirstSession,
  startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
}: PrepareBackendSessionOptions): Promise<PreparedBackendSession> {
  if (launchMode === "external") {
    if (externalBackendUrl === undefined) {
      throw new MissingExternalBackendUrlError()
    }
    return { backendUrl: externalBackendUrl, source: "external" }
  }

  if (launchMode === "resume") {
    const sessions = await listLiveBackendSessions({ healthProbe, pidProbe, registryRootDir })
    if (sessions.length === 0) {
      throw new NoRunningBackendSessionsError()
    }
    const selected = await sessionSelector(sessions)
    return { backendUrl: selected.url, session: selected, source: "resume" }
  }

  assertCanStartManagedBackend({ backendMode, runtimeEnv })
  const port = await portAllocator()
  const now = clock()
  const id = createSessionId({ date: now, port })
  const url = `http://${DEFAULT_HOST}:${port}`
  const sessionDir = join(registryRootDir, id)
  const logPath = join(sessionDir, "backend.log")
  await mkdir(sessionDir, { recursive: true })
  const spawnResult = await processSpawner({
    command: backendCommand(backendMode, port),
    cwd: join(repoRootDir, "backend"),
    env: backendEnv({ backendMode, port, runtimeEnv }),
    logPath,
  })
  const session: BackendSessionRecord = {
    createdAt: now.toISOString(),
    id,
    label: null,
    mode: backendMode,
    pid: spawnResult.pid,
    port,
    url,
  }
  await waitForBackendHealth({ healthProbe, logPath, timeoutMs: startupTimeoutMs, url })
  await appendSession({ registryRootDir, session })
  return { backendUrl: url, session, source: "new" }
}

export async function stopBackendSession({
  healthProbe = defaultHealthProbe,
  pidProbe = defaultPidProbe,
  processStopper = defaultProcessStopper,
  registryRootDir = defaultBackendSessionRootDir(),
  sessionId,
}: {
  readonly healthProbe?: HealthProbe
  readonly pidProbe?: PidProbe
  readonly processStopper?: ProcessStopper
  readonly registryRootDir?: string
  readonly sessionId: string
}): Promise<{ readonly stopped: boolean }> {
  return stopRegisteredSession({
    healthProbe,
    pidProbe,
    processStopper,
    registryRootDir,
    sessionId,
  })
}

export async function listLiveBackendSessions({
  healthProbe = defaultHealthProbe,
  pidProbe = defaultPidProbe,
  registryRootDir = defaultBackendSessionRootDir(),
}: {
  readonly healthProbe?: HealthProbe
  readonly pidProbe?: PidProbe
  readonly registryRootDir?: string
} = {}): Promise<readonly BackendSessionRecord[]> {
  const registry = await readRegistry(registryRootDir)
  const live: BackendSessionRecord[] = []
  const staleSessionIds = new Set<string>()
  for (const session of registry.sessions) {
    if (pidProbe(session.pid) && (await healthProbe(session.url))) {
      live.push(session)
    } else {
      staleSessionIds.add(session.id)
    }
  }
  if (staleSessionIds.size > 0) {
    await pruneStaleSessionIds({ registryRootDir, staleSessionIds })
  }
  return live
}
