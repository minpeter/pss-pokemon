import { describe, expect, test } from "bun:test"
import { createRecordingTransport } from "./agent-test-fixtures"
import { createPokemonControlPlane } from "./agent-tools"

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
})
