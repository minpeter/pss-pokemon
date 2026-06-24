import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type ProcessSpawnRequest, prepareBackendSession } from "./backend-session-manager"

describe("backend session manager", () => {
  test("allocates a fresh port and records a new backend session", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const spawned: ProcessSpawnRequest[] = []

    const prepared = await prepareBackendSession({
      backendMode: "fake",
      clock: () => new Date("2026-06-08T00:00:00.000Z"),
      healthProbe: async () => true,
      launchMode: "new",
      pidProbe: () => true,
      portAllocator: () => Promise.resolve(18765),
      processSpawner: (request) => {
        spawned.push(request)
        return Promise.resolve({ pid: 4242 })
      },
      registryRootDir: rootDir,
      repoRootDir: "/repo",
      runtimeEnv: {},
    })

    expect(prepared.source).toBe("new")
    if (prepared.source !== "new") {
      throw new Error("expected a new backend session")
    }
    expect(prepared.backendUrl).toBe("http://127.0.0.1:18765")
    expect(prepared.session).toEqual({
      createdAt: "2026-06-08T00:00:00.000Z",
      id: "pokemon-20260608-000000-18765",
      label: null,
      mode: "fake",
      pid: 4242,
      port: 18765,
      url: "http://127.0.0.1:18765",
    })
    expect(spawned).toHaveLength(1)

    const registry = JSON.parse(await readFile(join(rootDir, "sessions.json"), "utf8"))
    expect(registry).toEqual({
      sessions: [prepared.session],
      version: 1,
    })
  })

  test("uses an explicit backend URL as an external session without spawning", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const spawned: ProcessSpawnRequest[] = []

    const prepared = await prepareBackendSession({
      backendMode: "real",
      externalBackendUrl: "http://127.0.0.1:9999",
      healthProbe: async () => true,
      launchMode: "external",
      pidProbe: () => true,
      portAllocator: () => Promise.resolve(18765),
      processSpawner: (request) => {
        spawned.push(request)
        return Promise.resolve({ pid: 4242 })
      },
      registryRootDir: rootDir,
      repoRootDir: "/repo",
      runtimeEnv: {},
    })

    expect(prepared).toEqual({
      backendUrl: "http://127.0.0.1:9999",
      source: "external",
    })
    expect(spawned).toEqual([])
  })

  test("rejects managed real backend sessions without a ROM path before spawning", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const spawned: ProcessSpawnRequest[] = []

    try {
      await prepareBackendSession({
        backendMode: "real",
        healthProbe: async () => true,
        launchMode: "new",
        pidProbe: () => true,
        portAllocator: () => Promise.resolve(18765),
        processSpawner: (request) => {
          spawned.push(request)
          return Promise.resolve({ pid: 4242 })
        },
        registryRootDir: rootDir,
        repoRootDir: "/repo",
        runtimeEnv: {},
      })
      throw new Error("expected missing ROM path error")
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error
      }
      expect(error.message).toContain("managed real backend sessions require POKEMON_ROM_PATH")
    }
    expect(spawned).toEqual([])
  })

  test("spawns uvicorn with an allocated port and waits for health", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const spawned: ProcessSpawnRequest[] = []
    const probedUrls: string[] = []

    const prepared = await prepareBackendSession({
      backendMode: "real",
      clock: () => new Date("2026-06-08T00:00:00.000Z"),
      healthProbe: (url) => {
        probedUrls.push(url)
        return Promise.resolve(true)
      },
      launchMode: "new",
      pidProbe: () => true,
      portAllocator: () => Promise.resolve(18765),
      processSpawner: (request) => {
        spawned.push(request)
        return Promise.resolve({ pid: 4242 })
      },
      registryRootDir: rootDir,
      repoRootDir: "/repo",
      runtimeEnv: {
        POKEMON_ROM_PATH: "/roms/red.gb",
      },
    })

    expect(prepared.backendUrl).toBe("http://127.0.0.1:18765")
    expect(probedUrls).toEqual(["http://127.0.0.1:18765"])
    expect(spawned).toEqual([
      {
        command: [
          "uv",
          "run",
          "uvicorn",
          "pokemon_harness.main:app",
          "--host",
          "127.0.0.1",
          "--port",
          "18765",
        ],
        cwd: "/repo/backend",
        env: {
          POKEMON_BACKEND_MODE: "real",
          POKEMON_HOST: "127.0.0.1",
          POKEMON_PORT: "18765",
          POKEMON_ROM_PATH: "/roms/red.gb",
        },
        logPath: join(rootDir, "pokemon-20260608-000000-18765", "backend.log"),
      },
    ])
  })

  test("spawns fake uvicorn when fake backend mode is selected", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const commands: string[][] = []

    await prepareBackendSession({
      backendMode: "fake",
      healthProbe: async () => true,
      launchMode: "new",
      pidProbe: () => true,
      portAllocator: () => Promise.resolve(18765),
      processSpawner: (request) => {
        commands.push([...request.command])
        return Promise.resolve({ pid: 4242 })
      },
      registryRootDir: rootDir,
      repoRootDir: "/repo",
      runtimeEnv: {},
    })

    expect(commands[0]).toContain("pokemon_harness.fake_main:app")
  })

  test("reports backend startup timeout with the backend log path", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "pokemon-backend-sessions-"))
    const rootDir = join(tempRoot, ".local", "backend-sessions")

    try {
      await prepareBackendSession({
        backendMode: "fake",
        healthProbe: async () => false,
        launchMode: "new",
        pidProbe: () => true,
        portAllocator: () => Promise.resolve(18765),
        processSpawner: () => Promise.resolve({ pid: 4242 }),
        registryRootDir: rootDir,
        repoRootDir: "/repo",
        runtimeEnv: {},
        startupTimeoutMs: 1,
      })
      throw new Error("expected backend startup timeout")
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error
      }
      expect(error.message).toContain(".local/backend-sessions")
    }
  })
})
