import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type BackendSessionRecord,
  listLiveBackendSessions,
  prepareBackendSession,
  stopBackendSession,
} from "./backend-session-manager"
import { appendSession } from "./backend-session-registry"

type TestRegistry = {
  readonly sessions: readonly BackendSessionRecord[]
  readonly version: 1
}

describe("backend session registry", () => {
  test("prunes stale sessions before offering resume choices", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const live = backendSession({ id: "live", pid: 111, port: 18765 })
    const stale = backendSession({
      createdAt: "2026-06-08T00:01:00.000Z",
      id: "stale",
      pid: 222,
      port: 18766,
    })
    await writeRegistry(rootDir, [live, stale])

    const sessions = await listLiveBackendSessions({
      healthProbe: async (url) => url === live.url,
      pidProbe: (pid) => pid === live.pid,
      registryRootDir: rootDir,
    })

    expect(sessions).toEqual([live])
    expect(await readRegistry(rootDir)).toEqual({ sessions: [live], version: 1 })
  })

  test("resume offers only live backend sessions", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const live = backendSession({ id: "live", pid: 111, port: 18765 })
    const stale = backendSession({
      createdAt: "2026-06-08T00:01:00.000Z",
      id: "stale",
      pid: 222,
      port: 18766,
    })
    await writeRegistry(rootDir, [live, stale])
    const offered: (readonly BackendSessionRecord[])[] = []

    const prepared = await prepareBackendSession({
      backendMode: "fake",
      healthProbe: async (url) => url === live.url,
      launchMode: "resume",
      pidProbe: (pid) => pid === live.pid,
      portAllocator: () => Promise.resolve(18765),
      processSpawner: () => Promise.resolve({ pid: 4242 }),
      registryRootDir: rootDir,
      repoRootDir: "/repo",
      runtimeEnv: {},
      sessionSelector: (sessions) => {
        offered.push(sessions)
        return Promise.resolve(live)
      },
    })

    expect(prepared).toEqual({ backendUrl: live.url, session: live, source: "resume" })
    expect(offered).toEqual([[live]])
  })

  test("stop removes a live session after process termination", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const live = backendSession({ id: "live", pid: 111, port: 18765 })
    const stopped: number[] = []
    await writeRegistry(rootDir, [live])

    const result = await stopBackendSession({
      healthProbe: async (url) => url === live.url,
      pidProbe: (pid) => pid === live.pid,
      processStopper: (pid: number) => {
        stopped.push(pid)
        return Promise.resolve()
      },
      registryRootDir: rootDir,
      sessionId: live.id,
    })

    expect(result).toEqual({ stopped: true })
    expect(stopped).toEqual([111])
    expect(await readRegistry(rootDir)).toEqual({ sessions: [], version: 1 })
  })

  test("stop prunes a stale session without signaling its stale pid", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const stale = backendSession({ id: "stale", pid: 999_999, port: 18765 })
    const stopped: number[] = []
    await writeRegistry(rootDir, [stale])

    const result = await stopBackendSession({
      processStopper: (pid: number) => {
        stopped.push(pid)
        return Promise.resolve()
      },
      registryRootDir: rootDir,
      sessionId: stale.id,
    })

    expect(result).toEqual({ stopped: false })
    expect(stopped).toEqual([])
    expect(await readRegistry(rootDir)).toEqual({ sessions: [], version: 1 })
  })

  test("preserves concurrent fresh session records", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const ports = [18765, 18766]
    let healthProbeCount = 0
    let releaseHealthProbes: (() => void) | null = null
    const healthBarrier = new Promise<void>((resolve) => {
      releaseHealthProbes = resolve
    })

    await Promise.all(
      ports.map((port) =>
        prepareBackendSession({
          backendMode: "fake",
          clock: () => new Date(`2026-06-08T00:00:0${port - 18765}.000Z`),
          healthProbe: async () => {
            healthProbeCount += 1
            if (healthProbeCount === ports.length) {
              releaseHealthProbes?.()
            }
            await healthBarrier
            return true
          },
          launchMode: "new",
          pidProbe: () => true,
          portAllocator: () => Promise.resolve(port),
          processSpawner: () => Promise.resolve({ pid: port }),
          registryRootDir: rootDir,
          repoRootDir: "/repo",
          runtimeEnv: {},
        }),
      ),
    )

    const registry = await readRegistry(rootDir)
    expect(registry.sessions.map((session: BackendSessionRecord) => session.port).sort()).toEqual(
      ports,
    )
  })

  test("preserves appended sessions while pruning stale records", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const live = backendSession({ id: "live", pid: 111, port: 18765 })
    const stale = backendSession({
      createdAt: "2026-06-08T00:01:00.000Z",
      id: "stale",
      pid: 222,
      port: 18766,
    })
    await writeRegistry(rootDir, [live, stale])
    const healthProbeEntered = Promise.withResolvers<void>()
    const healthProbeBarrier = Promise.withResolvers<void>()
    const liveList = listLiveBackendSessions({
      healthProbe: async (url) => {
        healthProbeEntered.resolve()
        await healthProbeBarrier.promise
        return url === live.url
      },
      pidProbe: () => true,
      registryRootDir: rootDir,
    })

    await healthProbeEntered.promise
    const created = prepareBackendSession({
      backendMode: "fake",
      clock: () => new Date("2026-06-08T00:02:00.000Z"),
      healthProbe: async () => true,
      launchMode: "new",
      pidProbe: () => true,
      portAllocator: () => Promise.resolve(18767),
      processSpawner: () => Promise.resolve({ pid: 333 }),
      registryRootDir: rootDir,
      repoRootDir: "/repo",
      runtimeEnv: {},
    })
    const createdSession = await created
    expect(createdSession).toMatchObject({
      backendUrl: "http://127.0.0.1:18767",
      source: "new",
    })
    healthProbeBarrier.resolve()
    await liveList

    const registry = await readRegistry(rootDir)
    expect(registry.sessions.map((session: BackendSessionRecord) => session.id).sort()).toEqual([
      "live",
      "pokemon-20260608-000200-18767",
    ])
  })

  test("recovers a stale registry lock left by a crashed process", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const staleLockDir = join(rootDir, "sessions.lock")
    await mkdir(staleLockDir)
    const staleTimestamp = new Date(Date.now() - 3_000)
    await utimes(staleLockDir, staleTimestamp, staleTimestamp)
    const session = backendSession({ id: "recovered", pid: 444, port: 18768 })

    await appendSession({ registryRootDir: rootDir, session })

    expect(await readRegistry(rootDir)).toEqual({ sessions: [session], version: 1 })
  })

  test("keeps an active registry lock while the owner is still running", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const live = backendSession({ id: "live", pid: 111, port: 18765 })
    const appended = backendSession({ id: "appended", pid: 222, port: 18766 })
    const stopperEntered = Promise.withResolvers<void>()
    const releaseStopper = Promise.withResolvers<void>()
    await writeRegistry(rootDir, [live])

    const stopped = stopBackendSession({
      healthProbe: async (url) => url === live.url,
      pidProbe: (pid) => pid === live.pid,
      processStopper: async () => {
        stopperEntered.resolve()
        await releaseStopper.promise
      },
      registryRootDir: rootDir,
      sessionId: live.id,
    })
    await stopperEntered.promise
    const appendedSession = appendSession({ registryRootDir: rootDir, session: appended })
    await Bun.sleep(2_100)
    releaseStopper.resolve()
    await stopped
    await appendedSession

    expect(await readRegistry(rootDir)).toEqual({ sessions: [appended], version: 1 })
  })
})

function backendSession({
  createdAt = "2026-06-08T00:00:00.000Z",
  id,
  label = null,
  mode = "fake",
  pid,
  port,
  url = `http://127.0.0.1:${port}`,
}: {
  readonly createdAt?: string
  readonly id: string
  readonly label?: string | null
  readonly mode?: BackendSessionRecord["mode"]
  readonly pid: number
  readonly port: number
  readonly url?: string
}): BackendSessionRecord {
  return { createdAt, id, label, mode, pid, port, url }
}

async function writeRegistry(
  rootDir: string,
  sessions: readonly BackendSessionRecord[],
): Promise<void> {
  await Bun.write(join(rootDir, "sessions.json"), JSON.stringify({ sessions, version: 1 }))
}

async function readRegistry(rootDir: string): Promise<TestRegistry> {
  return JSON.parse(await readFile(join(rootDir, "sessions.json"), "utf8"))
}
