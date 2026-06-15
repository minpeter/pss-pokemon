import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  PrepareBackendSessionOptions,
  PreparedBackendSession,
} from "./backend-session-manager"
import type { RunHumanControlPlaneOptions } from "./human-control-plane"
import { runHumanMain } from "./main"

describe("human main backend sessions", () => {
  test("human main starts a new backend session before the control plane", async () => {
    const prepared: PreparedBackendSession = {
      backendUrl: "http://127.0.0.1:18765",
      session: {
        createdAt: "2026-06-08T00:00:00.000Z",
        id: "pokemon-20260608-000000-18765",
        label: null,
        mode: "fake",
        pid: 4242,
        port: 18765,
        url: "http://127.0.0.1:18765",
      },
      source: "new",
    }
    const preparedOptions: PrepareBackendSessionOptions[] = []
    const controlPlaneUrls: string[] = []
    const statusLines: string[] = []

    await runHumanMain({
      argv: [],
      prepareSession: (options: PrepareBackendSessionOptions) => {
        preparedOptions.push(options)
        return Promise.resolve(prepared)
      },
      runControlPlane: (options: RunHumanControlPlaneOptions) => {
        controlPlaneUrls.push(options.backendUrl)
        return Promise.resolve()
      },
      runtimeEnv: {
        POKEMON_BACKEND_MODE: "fake",
      },
      writeStatus: (line: string) => {
        statusLines.push(line)
      },
    })

    expect(preparedOptions[0]?.launchMode).toBe("new")
    expect(preparedOptions[0]?.backendMode).toBe("fake")
    expect(controlPlaneUrls).toEqual(["http://127.0.0.1:18765"])
    expect(statusLines.join("\n")).toContain("Backend session pokemon-20260608-000000-18765")
  })

  test("human main uses external backend URL without spawning", async () => {
    const controlPlaneUrls: string[] = []

    await runHumanMain({
      argv: [],
      prepareSession: () =>
        Promise.resolve({ backendUrl: "http://127.0.0.1:9999", source: "external" }),
      runControlPlane: (options: RunHumanControlPlaneOptions) => {
        controlPlaneUrls.push(options.backendUrl)
        return Promise.resolve()
      },
      runtimeEnv: {
        POKEMON_BACKEND_URL: "http://127.0.0.1:9999",
      },
      writeStatus: () => {},
    })

    expect(controlPlaneUrls).toEqual(["http://127.0.0.1:9999"])
  })

  test("human main passes env file values to managed backend spawn", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-human-env-"))
    const envPath = join(rootDir, ".env")
    await Bun.write(envPath, "POKEMON_BACKEND_MODE=real\nPOKEMON_ROM_PATH=/roms/red.gb\n")
    const preparedOptions: PrepareBackendSessionOptions[] = []

    await runHumanMain({
      envFiles: [envPath],
      prepareSession: (options: PrepareBackendSessionOptions) => {
        preparedOptions.push(options)
        return Promise.resolve({
          backendUrl: "http://127.0.0.1:18765",
          session: {
            createdAt: "2026-06-08T00:00:00.000Z",
            id: "pokemon-20260608-000000-18765",
            label: null,
            mode: "real",
            pid: 4242,
            port: 18765,
            url: "http://127.0.0.1:18765",
          },
          source: "new",
        })
      },
      runControlPlane: () => Promise.resolve(),
      runtimeEnv: {},
      writeStatus: () => {},
    })

    expect(preparedOptions[0]?.runtimeEnv["POKEMON_ROM_PATH"]).toBe("/roms/red.gb")
  })
})
