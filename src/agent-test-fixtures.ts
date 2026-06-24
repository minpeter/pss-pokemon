import type { AgentObservation } from "./agent-observation-types"
import type { JsonTransport } from "./transport"

export const observationFixture: AgentObservation = {
  type: "observation",
  timestamp: "2026-06-04T00:00:00.000Z",
  frame: 26,
  state: {
    emulator: { frame: 26, romLoaded: true, saveStateLoaded: true },
    player: { name: "RED", tile: { x: 5, y: 6 }, facing: "up" },
    map: { id: 0, name: "Pallet Town" },
    party: [{ species: "Squirtle", level: 5, hp: 19, maxHp: 19, status: null }],
    bag: [{ name: "Potion", quantity: 1 }],
    badges: { owned: [] },
    battle: { active: false, kind: null, opponent: null },
    dialog: { active: false, text: null },
    flags: { values: {} },
    collision: {
      mapId: 0,
      mapName: "Pallet Town",
      width: 3,
      height: 3,
      grid: [
        [true, true, true],
        [true, false, true],
        [true, true, true],
      ],
      playerTile: { x: 5, y: 6 },
      passableDirections: ["up", "left"],
      ascii: "A B C D E F G H I J\n5 . . . . @ . . . . .",
      playerCell: "E5",
    },
    parserWarnings: [],
  },
  screenshot: {
    pngBase64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
    width: 1,
    height: 1,
  },
  gridScreenshot: {
    pngBase64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
    width: 1,
    height: 1,
  },
  lastAction: null,
  parserWarnings: [],
}

export function createRecordingTransport(sentPayloads: unknown[]): JsonTransport {
  return {
    getBytes: async (path) => {
      if (path === "screenshot/grid?scale=4") {
        return Buffer.from(observationFixture.gridScreenshot.pngBase64, "base64")
      }
      return new Uint8Array()
    },
    getJson: async (path) => {
      if (path === "health") {
        return {
          activeControllerId: null,
          frame: observationFixture.frame,
          romLoaded: true,
          saveStateLoaded: true,
          status: "ok",
        }
      }
      if (path === "state") {
        return observationFixture.state
      }
      if (path === "screenshot?format=base64") {
        return observationFixture.screenshot
      }
      return null
    },
    postJson: async (path, payload) => {
      sentPayloads.push({ path, payload })
      if (path === "control/heartbeat") {
        return {
          activeControllerId: observationFixture.lastAction?.controllerId ?? "manual-cli",
          status: "active",
        }
      }
      if (path === "control/release") {
        return {
          activeControllerId: null,
          status: "released",
        }
      }
      return {
        accepted: true,
        frameBefore: 10,
        frameAfter: 26,
        observation: {
          ...observationFixture,
          lastAction: payload,
        },
      }
    },
  }
}
