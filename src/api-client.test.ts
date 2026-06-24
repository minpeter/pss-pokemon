import { describe, expect, test } from "bun:test"
import { PokemonApiClient } from "./api-client"
import type { JsonTransport } from "./transport"

const transport: JsonTransport = {
  getBytes: async (path) => {
    if (path === "screenshot/grid?scale=4") {
      return Buffer.from("grid-png")
    }
    return new Uint8Array()
  },
  getJson: async (path) => {
    if (path === "health") {
      return {
        status: "ok",
        romLoaded: true,
        saveStateLoaded: true,
        frame: 10,
        activeControllerId: null,
      }
    }
    return null
  },
  postJson: async (path, payload) => {
    if (path === "save") {
      return { status: "saved", name: "qa-smoke" }
    }
    if (path === "load") {
      return { status: "loaded", name: "qa-smoke" }
    }
    if (path === "reset") {
      return { status: "reset", mode: "initial_save_state" }
    }
    if (path === "event") {
      return { broadcastTo: 0, success: true }
    }
    if (path !== "action") {
      return null
    }
    return {
      accepted: true,
      frameBefore: 10,
      frameAfter: 26,
      observation: {
        type: "observation",
        timestamp: "2026-06-04T00:00:00.000Z",
        frame: 26,
        state: {
          emulator: { frame: 26, romLoaded: true, saveStateLoaded: true },
          player: { name: "RED", tile: null, facing: null },
          map: { id: null, name: null },
          party: [],
          bag: [],
          badges: { owned: [] },
          battle: { active: false, kind: null, opponent: null },
          dialog: { active: false, text: null },
          flags: { values: {} },
          collision: {
            mapId: null,
            mapName: null,
            width: 0,
            height: 0,
            grid: [],
            playerTile: null,
            passableDirections: [],
          },
          parserWarnings: [],
        },
        screenshot: { pngBase64: "AA==", width: 1, height: 1 },
        lastAction: payload,
        parserWarnings: [],
      },
    }
  },
}

describe("PokemonApiClient", () => {
  test("parses health and action responses through Zod boundaries", async () => {
    const client = new PokemonApiClient(transport)

    const health = await client.health()
    const action = await client.sendAction({
      controllerId: "manual-cli",
      sequence: [{ type: "button", button: "up" }],
    })

    expect(health.romLoaded).toBe(true)
    expect(action.frameAfter).toBe(26)
  })

  test("sends save, load, and reset commands", async () => {
    const client = new PokemonApiClient(transport)

    const saved = await client.save("qa-smoke", false)
    const loaded = await client.load("qa-smoke")
    const reset = await client.reset("initial_save_state")

    expect(saved.status).toBe("saved")
    expect(loaded.status).toBe("loaded")
    expect(reset.mode).toBe("initial_save_state")
  })

  test("parses real backend screenshot base64 responses without dimensions", async () => {
    const client = new PokemonApiClient({
      getBytes: async () => new Uint8Array(),
      getJson: async (path) => {
        if (path === "screenshot?format=base64") {
          return { frame: 12, pngBase64: "AA==" }
        }
        return null
      },
      postJson: async () => null,
    })

    const screenshot = await client.screenshot()

    expect(screenshot).toEqual({ frame: 12, pngBase64: "AA==" })
  })

  test("returns abi v1 from backend screenshot base64 responses", async () => {
    const client = new PokemonApiClient({
      getBytes: async () => new Uint8Array(),
      getJson: async (path) => {
        if (path === "screenshot?format=base64") {
          return { abiVersion: "v1", frame: 12, pngBase64: "AA==" }
        }
        return null
      },
      postJson: async () => null,
    })

    const screenshot = await client.screenshot()

    expect(screenshot.abiVersion).toBe("v1")
  })

  test("keeps grid screenshot free of fabricated backend abi version", async () => {
    const client = new PokemonApiClient(transport)

    const screenshot = await client.gridScreenshot()

    expect(screenshot).toEqual({ pngBase64: Buffer.from("grid-png").toString("base64") })
    expect(Object.hasOwn(screenshot, "abiVersion")).toBe(false)
  })

  test("posts dashboard events through the event endpoint", async () => {
    const sentPayloads: unknown[] = []
    const client = new PokemonApiClient({
      getBytes: async () => new Uint8Array(),
      getJson: async () => null,
      postJson: async (path, payload) => {
        sentPayloads.push({ path, payload })
        return { broadcastTo: 0, success: true }
      },
    })

    const response = await client.postEvent({
      text: "At E5, heading to the gap.",
      type: "reasoning",
    })

    expect(response.success).toBe(true)
    expect(sentPayloads).toEqual([
      {
        path: "event",
        payload: {
          text: "At E5, heading to the gap.",
          type: "reasoning",
        },
      },
    ])
  })
})
