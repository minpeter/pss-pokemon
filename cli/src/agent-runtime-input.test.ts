import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentEvent, RuntimeLlm } from "@minpeter/pss-runtime"
import { createInMemoryPokemonAgentMemory } from "./agent-memory"
import { runAgentControlPlane } from "./agent-runtime"
import { createRecordingTransport } from "./agent-test-fixtures"
import { PokemonApiClient } from "./api-client"

describe("agent runtime input", () => {
  test("injects fresh observation as runtime input inside the model turn", async () => {
    const sentPayloads: unknown[] = []
    const eventTypes: AgentEvent["type"][] = []
    const historyLengths: number[] = []
    const llm: RuntimeLlm = async ({ history }) => {
      historyLengths.push(history.length)
      return [{ content: "ok", role: "assistant" }]
    }

    await runAgentControlPlane({
      aiBaseUrl: "https://example.test/v1",
      backendUrl: "http://127.0.0.1:8765",
      client: new PokemonApiClient(createRecordingTransport(sentPayloads)),
      controllerId: "agent-cli",
      llm,
      maxTurns: 1,
      modelId: "unused-test-model",
      onEvent: (event) => {
        eventTypes.push(event.type)
      },
      sessionId: "runtime-input-test",
    })

    expect(eventTypes).toContain("runtime-input")
    expect(historyLengths).toEqual([2])
  })

  test("injects bounded memory context with the fresh runtime observation", async () => {
    const sentPayloads: unknown[] = []
    const historyPayloads: string[] = []
    const memory = createInMemoryPokemonAgentMemory({
      invalidatedAssumptions: [],
      movementAttempts: [
        {
          direction: "up",
          failures: 3,
          lastFrame: 26,
          mapId: 0,
          mapName: "Pallet Town",
          tile: { x: 5, y: 6 },
        },
      ],
      recentActions: [],
    })
    const llm: RuntimeLlm = async ({ history }) => {
      historyPayloads.push(JSON.stringify(history))
      return [{ content: "ok", role: "assistant" }]
    }

    await runAgentControlPlane({
      aiBaseUrl: "https://example.test/v1",
      backendUrl: "http://127.0.0.1:8765",
      client: new PokemonApiClient(createRecordingTransport(sentPayloads)),
      controllerId: "agent-cli",
      llm,
      maxTurns: 1,
      memory,
      modelId: "unused-test-model",
      onEvent: () => {},
      sessionId: "memory-context-test",
    })

    expect(historyPayloads.join("\n")).toContain("Memory context:")
    expect(historyPayloads.join("\n")).toContain("STUCK_WARNING Repeated failed up movement")
  })

  test("loads default file memory for the active agent session", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-runtime-memory-"))
    const sessionDir = join(rootDir, "file-memory-test")
    const historyPayloads: string[] = []
    await mkdir(sessionDir, { recursive: true })
    await writeFile(
      join(sessionDir, "projection.json"),
      JSON.stringify({
        invalidatedAssumptions: [],
        movementAttempts: [
          {
            direction: "up",
            failures: 3,
            lastFrame: 26,
            mapId: 0,
            mapName: "Pallet Town",
            tile: { x: 5, y: 6 },
          },
        ],
        recentActions: [],
      }),
      "utf8",
    )
    const llm: RuntimeLlm = async ({ history }) => {
      historyPayloads.push(JSON.stringify(history))
      return [{ content: "ok", role: "assistant" }]
    }

    await runAgentControlPlane({
      aiBaseUrl: "https://example.test/v1",
      backendUrl: "http://127.0.0.1:8765",
      client: new PokemonApiClient(createRecordingTransport([])),
      controllerId: "agent-cli",
      llm,
      maxTurns: 1,
      memoryRootDir: rootDir,
      modelId: "unused-test-model",
      onEvent: () => {},
      sessionId: "file-memory-test",
    })

    expect(historyPayloads.join("\n")).toContain("STUCK_WARNING Repeated failed up movement")
  })
})
