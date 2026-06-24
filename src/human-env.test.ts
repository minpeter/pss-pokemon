import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readHumanEnvFromFiles } from "./human-env"

describe("readHumanEnvFromFiles", () => {
  test("loads backend URL from env files without requiring the process cwd to be repo root", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokemon-human-env-"))
    const rootEnv = join(root, ".env")
    await writeFile(rootEnv, "POKEMON_BACKEND_URL=http://127.0.0.1:9999\n")

    const env = readHumanEnvFromFiles({
      envFiles: [rootEnv],
      runtimeEnv: {},
    })

    expect(env).toMatchObject({
      backendUrl: "http://127.0.0.1:9999",
      backendMode: "real",
      backendSessionMode: "external",
      backendSessionRootDir: ".local/backend-sessions",
    })
    expect(env.backendRuntimeEnv["POKEMON_BACKEND_URL"]).toBe("http://127.0.0.1:9999")
  })

  test("defaults to a new managed backend session", () => {
    const env = readHumanEnvFromFiles({
      envFiles: [],
      runtimeEnv: {},
    })

    expect(env.backendSessionMode).toBe("new")
    expect(env.backendMode).toBe("real")
  })

  test("leaves trace disabled when trace root is unset", () => {
    const env = readHumanEnvFromFiles({
      envFiles: [],
      runtimeEnv: {},
    })

    expect(env.traceRootDir).toBeUndefined()
    expect(env.traceRunId).toBeUndefined()
  })

  test("defaults the human trace run id when trace root is set", () => {
    const env = readHumanEnvFromFiles({
      envFiles: [],
      runtimeEnv: {
        POKEMON_TRACE_ROOT: ".omo/evidence/task-9-run",
      },
    })

    expect(env.traceRootDir).toBe(".omo/evidence/task-9-run")
    expect(env.traceRunId).toBe("human-cli")
  })

  test("rejects traversal trace run ids", () => {
    expect(() =>
      readHumanEnvFromFiles({
        envFiles: [],
        runtimeEnv: {
          POKEMON_TRACE_ROOT: ".omo/evidence/task-9-run",
          POKEMON_TRACE_RUN_ID: "../escape",
        },
      }),
    ).toThrow()
  })

  test("uses explicit backend URL as an external session", () => {
    const env = readHumanEnvFromFiles({
      envFiles: [],
      runtimeEnv: {
        POKEMON_BACKEND_URL: "http://127.0.0.1:9999",
      },
    })

    expect(env.backendUrl).toBe("http://127.0.0.1:9999")
    expect(env.backendSessionMode).toBe("external")
  })

  test("lets explicit new mode override an explicit backend URL", () => {
    const env = readHumanEnvFromFiles({
      argv: ["--new"],
      envFiles: [],
      runtimeEnv: {
        POKEMON_BACKEND_URL: "http://127.0.0.1:9999",
      },
    })

    expect(env.backendSessionMode).toBe("new")
  })

  test("allows resume mode from argv", () => {
    const env = readHumanEnvFromFiles({
      argv: ["--resume"],
      envFiles: [],
      runtimeEnv: {},
    })

    expect(env.backendSessionMode).toBe("resume")
  })
})
