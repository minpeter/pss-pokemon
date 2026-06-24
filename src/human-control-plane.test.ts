import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import type { AgentObservation } from "./agent-observation-types"
import { createRecordingTransport } from "./agent-test-fixtures"
import { PokemonApiClient } from "./api-client"
import { HUMAN_CONTROLLER_ID } from "./control-modes"
import {
  type HumanControlView,
  type HumanKeyInput,
  runHumanControlPlane,
} from "./human-control-plane"
import { createTraceWriter } from "./trace-writer"

const traceActionRecordSchema = z.object({
  type: z.literal("human.action"),
  action: z.object({
    controllerId: z.literal(HUMAN_CONTROLLER_ID),
    sequence: z.tuple([z.object({ type: z.literal("button"), button: z.literal("a") })]),
  }),
  result: z.object({
    turn: z.literal(1),
    frameBefore: z.literal(10),
    frameAfter: z.literal(26),
    verification: z.object({
      frameAdvanced: z.literal(true),
      summary: z.literal("frame advanced; position unchanged; dialog unchanged; battle unchanged"),
    }),
    observation: z.object({
      screenshot: z.object({
        pngBase64Length: z.number().int().positive(),
      }),
    }),
  }),
})

describe("runHumanControlPlane", () => {
  test("trace records action execution for keyboard actions without screenshot bodies", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-human-trace-"))
    const traceWriter = await createTraceWriter({
      rootDir,
      runId: "human-trace",
      clock: () => new Date("2026-06-15T01:02:03.000Z"),
    })

    await runHumanControlPlane({
      backendUrl: "http://127.0.0.1:8765",
      client: new PokemonApiClient(createRecordingTransport([])),
      input: new SingleKeyInput("j"),
      maxTurns: 1,
      traceWriter,
      view: createRecordingView([]),
    })

    const text = await readFile(join(rootDir, "human-trace", "actions.jsonl"), "utf8")
    const records = text
      .trimEnd()
      .split("\n")
      .map((line) => traceActionRecordSchema.parse(JSON.parse(line)))

    expect(records).toHaveLength(1)
    expect(records.at(0)?.result.verification.summary).toContain("frame advanced")
    expect(JSON.stringify(records)).not.toContain("iVBOR")
  })

  test("uses the shared observation and action path for keyboard actions", async () => {
    const sentPayloads: unknown[] = []
    const observations: string[] = []
    const client = new PokemonApiClient(createRecordingTransport(sentPayloads))

    await runHumanControlPlane({
      backendUrl: "http://127.0.0.1:8765",
      client,
      input: new SingleKeyInput("j"),
      maxTurns: 1,
      view: createRecordingView(observations),
    })

    expect(sentPayloads).toEqual([
      {
        path: "control/heartbeat",
        payload: {
          controllerId: HUMAN_CONTROLLER_ID,
        },
      },
      {
        path: "action",
        payload: {
          controllerId: HUMAN_CONTROLLER_ID,
          sequence: [{ type: "button", button: "a" }],
        },
      },
      {
        path: "control/release",
        payload: {
          controllerId: HUMAN_CONTROLLER_ID,
        },
      },
    ])
    expect(observations).toEqual(["before:1:grid", "after:1:grid:action"])
  })

  test("releases the controller when SIGINT requests shutdown", async () => {
    const sentPayloads: unknown[] = []
    const observations: string[] = []
    const run = runHumanControlPlane({
      backendUrl: "http://127.0.0.1:8765",
      client: new PokemonApiClient(createRecordingTransport(sentPayloads)),
      input: new WaitingInput(),
      view: createRecordingView(observations),
    })

    const result = await Promise.race([
      run.then(() => "done"),
      Bun.sleep(100).then(() => "timeout"),
    ])

    expect(result).toBe("done")
    expect(sentPayloads).toEqual([
      {
        path: "control/heartbeat",
        payload: {
          controllerId: HUMAN_CONTROLLER_ID,
        },
      },
      {
        path: "control/release",
        payload: {
          controllerId: HUMAN_CONTROLLER_ID,
        },
      },
    ])
  })
})

class SingleKeyInput implements HumanKeyInput {
  readonly isTTY = true
  #listener: ((chunk: string | Uint8Array) => void) | null = null

  constructor(readonly key: string) {}

  off(_event: "data", listener: (chunk: string | Uint8Array) => void): void {
    if (this.#listener === listener) {
      this.#listener = null
    }
  }

  on(_event: "data", listener: (chunk: string | Uint8Array) => void): void {
    this.#listener = listener
    queueMicrotask(() => {
      this.#listener?.(this.key)
    })
  }

  pause(): void {}

  resume(): void {}

  setEncoding(_encoding: BufferEncoding): void {}

  setRawMode(_mode: boolean): void {}
}

class WaitingInput implements HumanKeyInput {
  readonly isTTY = true

  off(_event: "data", _listener: (chunk: string | Uint8Array) => void): void {}

  on(_event: "data", _listener: (chunk: string | Uint8Array) => void): void {
    queueMicrotask(() => {
      process.emit("SIGINT")
    })
  }

  pause(): void {}

  resume(): void {}

  setEncoding(_encoding: BufferEncoding): void {}

  setRawMode(_mode: boolean): void {}
}

function createRecordingView(observations: string[]): HumanControlView {
  return {
    showActionObservation: (observation, turn) => {
      observations.push(
        `after:${turn}:${hasGrid(observation) ? "grid" : "no-grid"}:${
          observation.lastAction === null ? "none" : "action"
        }`,
      )
      return Promise.resolve()
    },
    showObservation: (observation, turn) => {
      observations.push(`before:${turn}:${hasGrid(observation) ? "grid" : "no-grid"}`)
      return Promise.resolve()
    },
  }
}

function hasGrid(observation: AgentObservation): boolean {
  return observation.gridScreenshot.pngBase64.length > 0
}
