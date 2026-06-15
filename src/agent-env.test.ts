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

    expect(env).toMatchObject({
      aiApiKey: "from-root",
      aiBaseUrl: "https://example.test/v1",
      backendUrl: "http://127.0.0.1:9999",
      backendMode: "real",
      backendSessionMode: "external",
      backendSessionRootDir: ".local/backend-sessions",
      controllerId: "manual-cli",
      modelId: "root-model",
      sessionId: "root-session",
    })
    expect(env.backendRuntimeEnv["POKEMON_BACKEND_URL"]).toBe("http://127.0.0.1:9999")
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

  test("defaults to a new managed backend session", () => {
    const env = readAgentEnvFromFiles({
      envFiles: [],
      runtimeEnv: {},
    })

    expect(env.backendSessionMode).toBe("new")
    expect(env.backendMode).toBe("real")
  })

  test("leaves trace disabled when trace root is unset", () => {
    const env = readAgentEnvFromFiles({
      envFiles: [],
      runtimeEnv: {},
    })

    expect(env.traceRootDir).toBeUndefined()
    expect(env.traceRunId).toBeUndefined()
  })

  test("defaults the agent trace run id to the session id when trace root is set", () => {
    const env = readAgentEnvFromFiles({
      envFiles: [],
      runtimeEnv: {
        POKEMON_AGENT_SESSION_ID: "agent-session-1",
        POKEMON_TRACE_ROOT: ".omo/evidence/task-9-run",
      },
    })

    expect(env.traceRootDir).toBe(".omo/evidence/task-9-run")
    expect(env.traceRunId).toBe("agent-session-1")
  })

  test("uses an explicit trace run id when trace root is set", () => {
    const env = readAgentEnvFromFiles({
      envFiles: [],
      runtimeEnv: {
        POKEMON_AGENT_SESSION_ID: "agent-session-1",
        POKEMON_TRACE_ROOT: ".omo/evidence/task-9-run",
        POKEMON_TRACE_RUN_ID: "qa-task-9",
      },
    })

    expect(env.traceRunId).toBe("qa-task-9")
  })

  test("rejects traversal trace run ids", () => {
    expect(() =>
      readAgentEnvFromFiles({
        envFiles: [],
        runtimeEnv: {
          POKEMON_TRACE_ROOT: ".omo/evidence/task-9-run",
          POKEMON_TRACE_RUN_ID: "../escape",
        },
      }),
    ).toThrow()
  })

  test("allows fake backend mode from env", () => {
    const env = readAgentEnvFromFiles({
      envFiles: [],
      runtimeEnv: {
        POKEMON_BACKEND_MODE: "fake",
      },
    })

    expect(env.backendMode).toBe("fake")
  })

  test("lets explicit new mode override an explicit backend URL", () => {
    const env = readAgentEnvFromFiles({
      argv: ["--new"],
      envFiles: [],
      runtimeEnv: {
        POKEMON_BACKEND_URL: "http://127.0.0.1:9999",
      },
    })

    expect(env.backendSessionMode).toBe("new")
  })

  test("allows resume mode from argv", () => {
    const env = readAgentEnvFromFiles({
      argv: ["--resume"],
      envFiles: [],
      runtimeEnv: {},
    })

    expect(env.backendSessionMode).toBe("resume")
  })
})
