import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readAgentEnvFromFiles } from "./agent-env"

describe("readAgentEnvFromFiles", () => {
  test("loads root env values without requiring the process cwd to be repo root", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokemon-agent-env-"))
    const rootEnv = join(root, ".env")
    await writeFile(
      rootEnv,
      [
        "POKEMON_AI_BASE_URL=https://example.test/v1",
        "POKEMON_AI_API_KEY=from-root",
        "POKEMON_AI_MODEL=root-model",
        "POKEMON_BACKEND_URL=http://127.0.0.1:9999",
        "POKEMON_AGENT_CONTROLLER_ID=manual-cli",
        "POKEMON_AGENT_SESSION_ID=root-session",
      ].join("\n"),
    )

    const env = readAgentEnvFromFiles({
      envFiles: [rootEnv],
      runtimeEnv: {},
    })

    expect(env).toEqual({
      aiApiKey: "from-root",
      aiBaseUrl: "https://example.test/v1",
      backendUrl: "http://127.0.0.1:9999",
      controllerId: "manual-cli",
      modelId: "root-model",
      sessionId: "root-session",
    })
  })

  test("lets later env files override ambient runtime variables", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokemon-agent-env-"))
    const envFile = join(root, ".env")
    await writeFile(envFile, "POKEMON_AI_MODEL=file-model\n")

    const env = readAgentEnvFromFiles({
      envFiles: [envFile],
      runtimeEnv: {
        AI_API_KEY: "ambient-key",
        AI_MODEL: "ambient-model",
      },
    })

    expect(env.aiApiKey).toBe("ambient-key")
    expect(env.modelId).toBe("file-model")
  })

  test("uses the human controller default when the configured model is human", () => {
    const env = readAgentEnvFromFiles({
      envFiles: [],
      runtimeEnv: {
        POKEMON_AI_MODEL: "human",
      },
    })

    expect(env.controllerId).toBe("manual-cli")
    expect(env.modelId).toBe("human")
  })
})
