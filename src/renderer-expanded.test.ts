import { describe, expect, test } from "bun:test"
import { renderObservation } from "./renderer"
import { ObservationSchema } from "./schemas"

const expandedObservation = ObservationSchema.parse({
  type: "observation",
  timestamp: "2026-06-04T00:00:02.000Z",
  frame: 3,
  state: {
    emulator: { frame: 3, romLoaded: true, saveStateLoaded: true },
    player: {
      name: "RED",
      tile: { x: 5, y: 6 },
      facing: "up",
      rivalName: "BLUE",
      money: 123456,
      playTime: "2:03:04",
      pokedexOwned: 3,
      pokedexSeen: 5,
    },
    map: { id: 0, name: "Pallet Town" },
    party: [
      {
        species: "Squirtle",
        level: 5,
        hp: 19,
        maxHp: 19,
        status: null,
        nickname: "SHELLY",
        types: ["Water"],
        moves: ["Tackle", "Tail Whip", "Water Gun"],
        stats: { attack: 12, defense: 11, speed: 10, special: 9 },
      },
    ],
    bag: [{ name: "Potion", quantity: 2 }],
    badges: { owned: ["Boulder"] },
    battle: {
      active: true,
      kind: "wild",
      opponent: "Charmander",
      enemy: {
        species: "Charmander",
        level: 4,
        hp: 12,
        maxHp: 17,
        status: "PSN",
        moves: ["Scratch", "Growl", "Ember"],
      },
    },
    dialog: { active: false, text: null },
    flags: { values: { hasPokedex: true, hasOaksParcel: true, hasTownMap: false } },
    collision: {
      mapId: 0,
      mapName: "Pallet Town",
      width: 0,
      height: 0,
      grid: [],
      playerTile: { x: 5, y: 6 },
      passableDirections: ["up", "left"],
    },
    parserWarnings: [],
  },
  screenshot: { pngBase64: "AA==", width: 1, height: 1 },
  lastAction: null,
  parserWarnings: [],
})

describe("renderObservation expanded RAM helpers", () => {
  test("shows expanded player party dex and battle details", async () => {
    const rendered = await renderObservation(expandedObservation, {
      render: () => Promise.resolve("[image]"),
    })

    expect(rendered).toContain("PLAYER RED")
    expect(rendered).toContain("$123456")
    expect(rendered).toContain("time 2:03:04")
    expect(rendered).toContain("rival BLUE")
    expect(rendered).toContain("DEX owned 3 seen 5")
    expect(rendered).toContain("SHELLY/Squirtle Lv5 19/19 OK")
    expect(rendered).toContain("types Water")
    expect(rendered).toContain("moves Tackle/Tail Whip/Water Gun")
    expect(rendered).toContain("stats Atk12 Def11 Spd10 Spc9")
    expect(rendered).toContain("BATTLE wild vs Charmander Lv4 12/17 PSN")
    expect(rendered).toContain("enemy moves Scratch/Growl/Ember")
  })
})
