import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { RegistryLockTimeoutError } from "./backend-session-errors"
import {
  type BackendSessionRecord,
  type BackendSessionRegistry,
  BackendSessionRegistrySchema,
  type ProcessStopper,
  REGISTRY_VERSION,
} from "./backend-session-types"

const REGISTRY_LOCK_RETRY_MS = 10
const REGISTRY_LOCK_TIMEOUT_MS = 2_000

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
  processStopper,
  registryRootDir,
  sessionId,
}: {
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
  const deadline = Date.now() + REGISTRY_LOCK_TIMEOUT_MS
  while (true) {
    try {
      await mkdir(lockDir)
      break
    } catch (error) {
      if (!isExistingFileError(error)) {
        throw error
      }
      if (Date.now() > deadline) {
        throw new RegistryLockTimeoutError(lockDir)
      }
      await Bun.sleep(REGISTRY_LOCK_RETRY_MS)
    }
  }
  try {
    return await operation()
  } finally {
    await rm(lockDir, { force: true, recursive: true })
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function isExistingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST"
}
