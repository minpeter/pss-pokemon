import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { RuntimeLlm } from "@minpeter/pss-runtime"
import { runAgentMain } from "./agent-main"
import type { RunAgentControlPlaneOptions } from "./agent-runtime"
import type {
  PrepareBackendSessionOptions,
  PreparedBackendSession,
} from "./backend-session-manager"
import type { RunHumanControlPlaneOptions } from "./human-control-plane"

describe("agent main backend sessions", () => {
  test("agent main starts a new backend session before model startup", async () => {
    const prepared = fakePreparedSession()
    const preparedOptions: PrepareBackendSessionOptions[] = []
    const agentBackendUrls: string[] = []
    const llm: RuntimeLlm = async () => [{ content: "ok", role: "assistant" }]

    await runAgentMain({
      argv: [],
      llm,
      prepareSession: (options: PrepareBackendSessionOptions) => {
        preparedOptions.push(options)
        return Promise.resolve(prepared)
      },
      runAgentPlane: (options: RunAgentControlPlaneOptions) => {
        agentBackendUrls.push(options.backendUrl)
        return Promise.resolve()
      },
      runHumanPlane: () => {
        throw new Error("unexpected human plane")
      },
      runtimeEnv: {
        POKEMON_AI_MODEL: "test-model",
        POKEMON_BACKEND_MODE: "fake",
      },
      writeStatus: () => {},
    })

    expect(preparedOptions[0]?.launchMode).toBe("new")
    expect(preparedOptions[0]?.backendMode).toBe("fake")
    expect(agentBackendUrls).toEqual([prepared.backendUrl])
  })

  test("agent human-model resume uses the selected backend URL and manual controller", async () => {
    const prepared = fakePreparedSession()
    const humanCalls: Array<{ readonly backendUrl: string; readonly controllerId?: string }> = []

    await runAgentMain({
      argv: ["--resume"],
      prepareSession: () => Promise.resolve(prepared),
      runAgentPlane: () => {
        throw new Error("unexpected agent plane")
      },
      runHumanPlane: (options: RunHumanControlPlaneOptions) => {
        humanCalls.push({
          backendUrl: options.backendUrl,
          ...(options.controllerId === undefined ? {} : { controllerId: options.controllerId }),
        })
        return Promise.resolve()
      },
      runtimeEnv: {
        POKEMON_AI_MODEL: "human",
      },
      writeStatus: () => {},
    })

    expect(humanCalls).toEqual([{ backendUrl: prepared.backendUrl, controllerId: "manual-cli" }])
  })

  test("normal agent mode keeps configured agent memory session id", async () => {
    const sessionIds: string[] = []

    await runAgentMain({
      argv: [],
      envFiles: [],
      prepareSession: () => Promise.resolve(fakePreparedSession()),
      runAgentPlane: (options: RunAgentControlPlaneOptions) => {
        if (options.sessionId !== undefined) {
          sessionIds.push(options.sessionId)
        }
        return Promise.resolve()
      },
      runHumanPlane: () => {
        throw new Error("unexpected human plane")
      },
      runtimeEnv: {
        POKEMON_AGENT_SESSION_ID: "memory-session",
      },
      writeStatus: () => {},
    })

    expect(sessionIds).toEqual(["memory-session"])
  })

  test("agent main passes env file values to managed backend spawn", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-agent-env-"))
    const envPath = join(rootDir, ".env")
    await Bun.write(
      envPath,
      "POKEMON_AI_MODEL=test-model\nPOKEMON_BACKEND_MODE=real\nPOKEMON_ROM_PATH=/roms/red.gb\n",
    )
    const preparedOptions: PrepareBackendSessionOptions[] = []
    const llm: RuntimeLlm = async () => [{ content: "ok", role: "assistant" }]

    await runAgentMain({
      envFiles: [envPath],
      llm,
      prepareSession: (options: PrepareBackendSessionOptions) => {
        preparedOptions.push(options)
        return Promise.resolve(fakePreparedSession())
      },
      runAgentPlane: () => Promise.resolve(),
      runHumanPlane: () => {
        throw new Error("unexpected human plane")
      },
      runtimeEnv: {},
      writeStatus: () => {},
    })

    expect(preparedOptions[0]?.runtimeEnv["POKEMON_ROM_PATH"]).toBe("/roms/red.gb")
  })
})

function fakePreparedSession(): PreparedBackendSession & { readonly source: "new" } {
  return {
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
}
