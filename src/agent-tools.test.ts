import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { createRecordingTransport } from "./agent-test-fixtures"
import { createPokemonControlPlane, UseEmulatorInputSchema } from "./agent-tools"
import { recordTraceActionExecution } from "./trace-recording"
import { createTraceWriter } from "./trace-writer"

const agentTraceActionRecordSchema = z.object({
  type: z.literal("agent.action"),
  action: z.object({
    controllerId: z.literal("agent-test"),
    sequence: z.tuple([z.object({ type: z.literal("button"), button: z.literal("up") })]),
  }),
  result: z.object({
    actor: z.literal("agent"),
    frameBefore: z.literal(10),
    frameAfter: z.literal(26),
    turn: z.literal(3),
    verification: z.object({
      summary: z.literal("frame advanced; position unchanged; dialog unchanged; battle unchanged"),
    }),
  }),
})

describe("createPokemonControlPlane", () => {
  test("registers use_emulator as the only action-only Pokemon control tool", () => {
    const tools = createPokemonControlPlane({
      transport: createRecordingTransport([]),
    })

    expect(Object.keys(tools).sort()).toEqual(["use_emulator"])
    expect(tools).not.toHaveProperty("pokemon_reset")
    expect(tools).not.toHaveProperty("pokemon_load")
    expect(tools).not.toHaveProperty("pokemon_save")
    expect(tools).not.toHaveProperty("pokemon_press")
    expect(tools).not.toHaveProperty("pokemon_walk")
  })

  test("rejects reset load save and ROM controls from tool keys and input schema", () => {
    const tools = createPokemonControlPlane({
      transport: createRecordingTransport([]),
    })
    const forbiddenTokens = ["reset", "load", "save", "rom", "state"]
    const toolKeys = Object.keys(tools).join(" ").toLowerCase()

    for (const token of forbiddenTokens) {
      expect(toolKeys).not.toContain(token)
      expect(
        UseEmulatorInputSchema.safeParse({
          buttons: [token],
        }).success,
      ).toBe(false)
    }
  })

  test("executes emulator buttons through the backend action endpoint", async () => {
    const sentPayloads: unknown[] = []
    const tools = createPokemonControlPlane({
      controllerId: "agent-test",
      transport: createRecordingTransport(sentPayloads),
    })
    const execute = tools.use_emulator.execute
    if (execute === undefined) {
      throw new Error("use_emulator execute missing")
    }

    const output = await execute(
      { buttons: ["a", "wait", "up"] },
      { context: {}, messages: [], toolCallId: "tool-call-1" },
    )

    expect(sentPayloads).toEqual([
      {
        path: "action",
        payload: {
          controllerId: "agent-test",
          sequence: [
            { type: "button", button: "a" },
            { type: "wait", frames: 120 },
            { type: "button", button: "up" },
          ],
        },
      },
    ])
    expect(output).toEqual({
      buttons: ["a", "wait", "up"],
      frameAfter: 26,
      frameBefore: 10,
      map: "Pallet Town",
      ok: true,
      passableDirections: ["up", "left"],
      playerTile: "x=5, y=6",
      verification: {
        battleChanged: false,
        dialogChanged: false,
        frameAdvanced: true,
        moved: false,
        playerTileAfter: "x=5, y=6",
        playerTileBefore: "x=5, y=6",
        stateChanged: true,
        summary: "frame advanced; position unchanged; dialog unchanged; battle unchanged",
      },
    })
  })

  test("reports the updated observation after each backend action", async () => {
    const sentPayloads: unknown[] = []
    const actionObservations: unknown[] = []
    const tools = createPokemonControlPlane({
      controllerId: "agent-test",
      onActionObservation: (observation) => {
        actionObservations.push(observation)
      },
      transport: createRecordingTransport(sentPayloads),
    })
    const execute = tools.use_emulator.execute
    if (execute === undefined) {
      throw new Error("use_emulator execute missing")
    }

    await execute({ buttons: ["a"] }, { context: {}, messages: [], toolCallId: "tool-call-4" })

    expect(actionObservations).toEqual([
      expect.objectContaining({
        frame: 26,
        gridScreenshot: expect.objectContaining({
          pngBase64:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
        }),
        lastAction: {
          controllerId: "agent-test",
          sequence: [{ type: "button", button: "a" }],
        },
      }),
    ])
  })

  test("reports full action execution for memory reducers", async () => {
    const sentPayloads: unknown[] = []
    const executionSummaries: string[] = []
    const tools = createPokemonControlPlane({
      controllerId: "agent-test",
      onActionExecution: (execution) => {
        executionSummaries.push(execution.verification.summary)
      },
      transport: createRecordingTransport(sentPayloads),
    })
    const execute = tools.use_emulator.execute
    if (execute === undefined) {
      throw new Error("use_emulator execute missing")
    }

    await execute({ buttons: ["up"] }, { context: {}, messages: [], toolCallId: "tool-call-5" })

    expect(executionSummaries).toEqual([
      "frame advanced; position unchanged; dialog unchanged; battle unchanged",
    ])
  })

  test("trace records agent action execution from the action hook", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-agent-action-trace-"))
    const traceWriter = await createTraceWriter({
      rootDir,
      runId: "agent-action-trace",
      clock: () => new Date("2026-06-15T01:02:03.000Z"),
    })
    const tools = createPokemonControlPlane({
      controllerId: "agent-test",
      onActionExecution: (execution) =>
        recordTraceActionExecution(traceWriter, execution, 3, "agent"),
      transport: createRecordingTransport([]),
    })
    const execute = tools.use_emulator.execute
    if (execute === undefined) {
      throw new Error("use_emulator execute missing")
    }

    await execute({ buttons: ["up"] }, { context: {}, messages: [], toolCallId: "tool-call-8" })

    const text = await readFile(join(rootDir, "agent-action-trace", "actions.jsonl"), "utf8")
    const records = text
      .trimEnd()
      .split("\n")
      .map((line) => agentTraceActionRecordSchema.parse(JSON.parse(line)))
    expect(records).toHaveLength(1)
    expect(JSON.stringify(records)).not.toContain("iVBOR")
  })

  test("runs the action gate before posting to the backend", async () => {
    const sentPayloads: unknown[] = []
    let actionClaims = 0
    const tools = createPokemonControlPlane({
      controllerId: "agent-test",
      onBeforeAction: () => {
        actionClaims += 1
        if (actionClaims > 1) {
          throw new Error("turn already used an action")
        }
      },
      transport: createRecordingTransport(sentPayloads),
    })
    const execute = tools.use_emulator.execute
    if (execute === undefined) {
      throw new Error("use_emulator execute missing")
    }

    await execute({ buttons: ["up"] }, { context: {}, messages: [], toolCallId: "tool-call-6" })
    let secondActionBlocked = false
    try {
      await execute({ buttons: ["left"] }, { context: {}, messages: [], toolCallId: "tool-call-7" })
    } catch (error) {
      secondActionBlocked =
        error instanceof Error && error.message === "turn already used an action"
    }

    expect(secondActionBlocked).toBe(true)
    expect(sentPayloads).toHaveLength(1)
  })
})
