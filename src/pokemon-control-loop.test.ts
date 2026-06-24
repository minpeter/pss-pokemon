import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { createRecordingTransport } from "./agent-test-fixtures"
import { PokemonApiClient } from "./api-client"
import { runPokemonControlLoop } from "./pokemon-control-loop"
import { createTraceWriter } from "./trace-writer"
import type { JsonTransport } from "./transport"

const controlPayloadSchema = z.object({
  controllerId: z.string(),
})

const traceObservationRecordSchema = z.object({
  type: z.literal("control.observation"),
  frame: z.literal(26),
  observation: z.object({
    turn: z.literal(1),
    phase: z.literal("beforeTurn"),
    frame: z.literal(26),
    map: z.object({
      id: z.literal(0),
      name: z.literal("Pallet Town"),
    }),
    player: z.object({
      facing: z.literal("up"),
      tile: z.literal("x=5, y=6"),
    }),
    screenshot: z.object({
      pngBase64Length: z.number().int().positive(),
      width: z.literal(1),
      height: z.literal(1),
    }),
    gridScreenshot: z.object({
      pngBase64Length: z.number().int().positive(),
    }),
  }),
})

describe("pokemon control loop", () => {
  test("trace records lightweight turn observations without screenshot bodies", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-loop-trace-"))
    const traceWriter = await createTraceWriter({
      rootDir,
      runId: "loop-trace",
      clock: () => new Date("2026-06-15T01:02:03.000Z"),
    })
    const client = new PokemonApiClient(createRecordingTransport([]))

    await runPokemonControlLoop({
      actor: {
        runTurn: () => Promise.resolve({ type: "quit" }),
      },
      backendUrl: "http://127.0.0.1:18765",
      client,
      controllerId: "agent-cli",
      maxTurns: 1,
      traceWriter,
    })

    const text = await readFile(join(rootDir, "loop-trace", "observations.jsonl"), "utf8")
    const records = text
      .trimEnd()
      .split("\n")
      .map((line) => traceObservationRecordSchema.parse(JSON.parse(line)))

    expect(records).toHaveLength(1)
    expect(records.at(0)?.observation.screenshot.pngBase64Length).toBeGreaterThan(0)
    expect(JSON.stringify(records)).not.toContain("iVBOR")
  })

  test("releases the controller when SIGINT interrupts agent startup", async () => {
    const heartbeatSent = Promise.withResolvers<void>()
    const shutdown = Promise.withResolvers<void>()
    const released: string[] = []
    const client = new PokemonApiClient(
      createStartupInterruptTransport({
        onHeartbeat: () => heartbeatSent.resolve(),
        onRelease: (controllerId) => released.push(controllerId),
      }),
    )

    const run = runPokemonControlLoop({
      actor: {
        start: () => new Promise(() => {}),
        runTurn: () => {
          throw new Error("unexpected turn")
        },
      },
      backendUrl: "http://127.0.0.1:18765",
      client,
      controllerId: "agent-cli",
      shutdownSignal: shutdown.promise,
    })

    await heartbeatSent.promise
    shutdown.resolve()
    await run

    expect(released).toEqual(["agent-cli"])
  })
})

function createStartupInterruptTransport({
  onHeartbeat,
  onRelease,
}: {
  readonly onHeartbeat: () => void
  readonly onRelease: (controllerId: string) => void
}): JsonTransport {
  return {
    getBytes: async () => new Uint8Array(),
    getJson: async (path) => {
      if (path === "health") {
        return {
          activeControllerId: null,
          frame: 0,
          romLoaded: true,
          saveStateLoaded: true,
          status: "ok",
        }
      }
      return null
    },
    postJson: async (path, payload) => {
      const { controllerId } = controlPayloadSchema.parse(payload)
      if (path === "control/heartbeat") {
        onHeartbeat()
        return {
          activeControllerId: controllerId,
          status: "active",
        }
      }
      if (path === "control/release") {
        onRelease(controllerId)
        return {
          activeControllerId: null,
          status: "released",
        }
      }
      return null
    },
  } satisfies JsonTransport
}
