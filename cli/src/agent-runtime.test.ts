import { describe, expect, test } from "bun:test"
import {
  buildAgentInstructions,
  createDashboardEventForwarder,
  runAgentControlPlane,
  streamAgentEvents,
} from "./agent-runtime"
import { PokemonApiClient } from "./api-client"

describe("agent runtime wiring", () => {
  test("stops before model startup when another backend controller is active", async () => {
    const client = new PokemonApiClient({
      getBytes: async (path) => {
        throw new Error(`unexpected GET bytes ${path}`)
      },
      getJson: async (path) => {
        if (path !== "health") {
          throw new Error(`unexpected GET ${path}`)
        }
        return {
          activeControllerId: "manual-cli",
          frame: 10,
          romLoaded: true,
          saveStateLoaded: false,
          status: "ok",
        }
      },
      postJson: async (path) => {
        throw new Error(`unexpected POST ${path}`)
      },
    })

    try {
      await runAgentControlPlane({
        aiBaseUrl: "https://example.test/v1",
        backendUrl: "http://127.0.0.1:8765",
        client,
        controllerId: "agent-cli",
        maxTurns: 1,
        modelId: "test-model",
      })
      throw new Error("expected controller conflict")
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error
      }
      expect(error.message).toContain(
        "controller conflict: backend active controller is manual-cli, but requested controller is agent-cli",
      )
    }
  })

  test("builds instructions that forbid reset or reload controls", () => {
    const instructions = buildAgentInstructions()

    expect(instructions).toContain("already-loaded Pokemon game")
    expect(instructions).toContain("Do not reset, reload, save, or load")
    expect(instructions).toContain("use_emulator")
    expect(instructions).toContain("short sequence of 'a' and 'wait'")
    expect(instructions).toContain("If battle is active")
    expect(instructions).toContain("<action_plan>")
    expect(instructions).toContain("Memory context is secondary to the fresh live state")
  })

  test("streams pss-runtime 0.0.10 events through run.events", async () => {
    const seen: string[] = []

    const result = await streamAgentEvents(
      {
        events: async function* () {
          yield { type: "turn-start" }
          yield { text: "moving", type: "assistant-text" }
          yield { type: "turn-end" }
        },
      },
      (event) => {
        seen.push(event.type)
      },
    )

    expect(seen).toEqual(["turn-start", "assistant-text", "turn-end"])
    expect(result).toEqual({ ok: true })
  })

  test("forwards reasoning and decisions to dashboard events", async () => {
    const sentPayloads: unknown[] = []
    const seen: string[] = []
    const client = new PokemonApiClient({
      getBytes: async () => new Uint8Array(),
      getJson: async () => null,
      postJson: async (path, payload) => {
        sentPayloads.push({ path, payload })
        return { broadcastTo: 0, success: true }
      },
    })

    const result = await streamAgentEvents(
      {
        events: async function* () {
          yield { text: "<action_plan>Walk north.</action_plan>", type: "assistant-text" }
          yield {
            input: { buttons: ["up"] },
            toolCallId: "tool-call-1",
            toolName: "use_emulator",
            type: "tool-call",
          }
          yield {
            output: {
              verification: {
                summary: "frame advanced; position unchanged; dialog unchanged; battle unchanged",
              },
            },
            toolCallId: "tool-call-1",
            toolName: "use_emulator",
            type: "tool-result",
          }
          yield { type: "turn-end" }
        },
      },
      createDashboardEventForwarder(client, (event) => {
        seen.push(event.type)
      }),
    )

    expect(result).toEqual({ ok: true })
    expect(seen).toEqual(["assistant-text", "tool-call", "tool-result", "turn-end"])
    expect(sentPayloads).toEqual([
      {
        path: "event",
        payload: { text: "<action_plan>Walk north.</action_plan>", type: "reasoning" },
      },
      {
        path: "event",
        payload: {
          text: 'use_emulator {"buttons":["up"]}',
          type: "decision",
        },
      },
      {
        path: "event",
        payload: {
          text: "use_emulator: frame advanced; position unchanged; dialog unchanged; battle unchanged",
          type: "action",
        },
      },
    ])
  })

  test("reports pss-runtime turn errors so the agent loop does not spin", async () => {
    const seen: string[] = []

    const result = await streamAgentEvents(
      {
        events: async function* () {
          yield { message: "backend unavailable", type: "turn-error" }
        },
      },
      (event) => {
        seen.push(event.type)
      },
    )

    expect(seen).toEqual(["turn-error"])
    expect(result).toEqual({ errorMessage: "backend unavailable", ok: false })
  })
})
