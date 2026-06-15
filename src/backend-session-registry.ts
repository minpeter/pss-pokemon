import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { RegistryLockTimeoutError } from "./backend-session-errors"
import {
  type BackendSessionRecord,
  type BackendSessionRegistry,
  BackendSessionRegistrySchema,
  type HealthProbe,
  type PidProbe,
  type ProcessStopper,
  REGISTRY_VERSION,
} from "./backend-session-types"

const REGISTRY_LOCK_RETRY_MS = 10
const REGISTRY_LOCK_TIMEOUT_MS = 2_000
const REGISTRY_LOCK_WAIT_TIMEOUT_MS = 30_000
const REGISTRY_LOCK_HEARTBEAT_MS = 500
const REGISTRY_LOCK_HEARTBEAT_FILE = "heartbeat"

export async function appendSession({
  registryRootDir,
  session,
}: {
  readonly registryRootDir: string
  readonly session: BackendSessionRecord
}): Promise<void> {
  await withRegistryLock(registryRootDir, async () => {
    const registry = await readRegistry(registryRootDir)
    await writeRegistry(registryRootDir, {
      sessions: [...registry.sessions.filter((existing) => existing.id !== session.id), session],
      version: REGISTRY_VERSION,
    })
  })
}

export async function pruneStaleSessionIds({
  registryRootDir,
  staleSessionIds,
}: {
  readonly registryRootDir: string
  readonly staleSessionIds: ReadonlySet<string>
}): Promise<void> {
  await withRegistryLock(registryRootDir, async () => {
    const registry = await readRegistry(registryRootDir)
    await writeRegistry(registryRootDir, {
      sessions: registry.sessions.filter((session) => !staleSessionIds.has(session.id)),
      version: REGISTRY_VERSION,
    })
  })
}

export async function stopRegisteredSession({
  healthProbe,
  pidProbe,
  processStopper,
  registryRootDir,
  sessionId,
}: {
  readonly healthProbe: HealthProbe
  readonly pidProbe: PidProbe
  readonly processStopper: ProcessStopper
  readonly registryRootDir: string
  readonly sessionId: string
}): Promise<{ readonly stopped: boolean }> {
  return withRegistryLock(registryRootDir, async () => {
    const registry = await readRegistry(registryRootDir)
    const session = registry.sessions.find((candidate) => candidate.id === sessionId)
    if (session === undefined) {
      return { stopped: false }
    }
    if (!pidProbe(session.pid) || !(await healthProbe(session.url))) {
      await writeRegistry(registryRootDir, {
        sessions: registry.sessions.filter((candidate) => candidate.id !== sessionId),
        version: REGISTRY_VERSION,
      })
      return { stopped: false }
    }
    await processStopper(session.pid)
    await writeRegistry(registryRootDir, {
      sessions: registry.sessions.filter((candidate) => candidate.id !== sessionId),
      version: REGISTRY_VERSION,
    })
    return { stopped: true }
  })
}

export async function readRegistry(registryRootDir: string): Promise<BackendSessionRegistry> {
  const path = registryPath(registryRootDir)
  try {
    const payload = await readFile(path, "utf8")
    return BackendSessionRegistrySchema.parse(JSON.parse(payload))
  } catch (error) {
    if (isMissingFileError(error)) {
      return { sessions: [], version: REGISTRY_VERSION }
    }
    throw error
  }
}

export async function writeRegistry(
  registryRootDir: string,
  registry: BackendSessionRegistry,
): Promise<void> {
  await mkdir(registryRootDir, { recursive: true })
  await writeFile(registryPath(registryRootDir), JSON.stringify(registry, null, 2), "utf8")
}

function registryPath(registryRootDir: string): string {
  return join(registryRootDir, "sessions.json")
}

async function withRegistryLock<T>(
  registryRootDir: string,
  operation: () => Promise<T>,
): Promise<T> {
  await mkdir(registryRootDir, { recursive: true })
  const lockDir = join(registryRootDir, "sessions.lock")
  const heartbeatPath = join(lockDir, REGISTRY_LOCK_HEARTBEAT_FILE)
  const deadline = Date.now() + REGISTRY_LOCK_WAIT_TIMEOUT_MS
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  while (true) {
    try {
      await mkdir(lockDir)
      await refreshRegistryLockHeartbeat(heartbeatPath)
      heartbeatTimer = setInterval(() => {
        void refreshRegistryLockHeartbeat(heartbeatPath)
      }, REGISTRY_LOCK_HEARTBEAT_MS)
      break
    } catch (error) {
      if (!isExistingFileError(error)) {
        throw error
      }
      const now = Date.now()
      if (await removeStaleRegistryLock(lockDir, now)) {
        continue
      }
      if (now > deadline) {
        throw new RegistryLockTimeoutError(lockDir)
      }
      await Bun.sleep(REGISTRY_LOCK_RETRY_MS)
    }
  }
  try {
    return await operation()
  } finally {
    if (heartbeatTimer !== undefined) {
      clearInterval(heartbeatTimer)
    }
    await rm(lockDir, { force: true, recursive: true })
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function isExistingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST"
}

async function removeStaleRegistryLock(lockDir: string, now: number): Promise<boolean> {
  try {
    const timestampMs = await registryLockTimestampMs(lockDir)
    if (now - timestampMs <= REGISTRY_LOCK_TIMEOUT_MS) {
      return false
    }
    await rm(lockDir, { force: true, recursive: true })
    return true
  } catch (error) {
    if (isMissingFileError(error)) {
      return true
    }
    throw error
  }
}

async function registryLockTimestampMs(lockDir: string): Promise<number> {
  try {
    return (await stat(join(lockDir, REGISTRY_LOCK_HEARTBEAT_FILE))).mtimeMs
  } catch (error) {
    if (isMissingFileError(error)) {
      return (await stat(lockDir)).mtimeMs
    }
    throw error
  }
}

async function refreshRegistryLockHeartbeat(heartbeatPath: string): Promise<void> {
  await writeFile(heartbeatPath, `${Date.now()}\n`, "utf8")
}
