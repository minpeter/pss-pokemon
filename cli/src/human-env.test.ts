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

    expect(env).toEqual({
      backendUrl: "http://127.0.0.1:9999",
    })
  })
})
