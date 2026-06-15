import { describe, expect, test } from "bun:test"
import { renderObservation, writeObservationFrame } from "./renderer"
import { ObservationSchema } from "./schemas"

const observation = ObservationSchema.parse({
  type: "observation",
  timestamp: "2026-06-04T00:00:00.000Z",
  frame: 1,
  state: {
    emulator: { frame: 1, romLoaded: true, saveStateLoaded: true },
    player: { name: "RED", tile: { x: 5, y: 6 }, facing: "up" },
    map: { id: 0, name: "Pallet Town" },
    party: [{ species: "Squirtle", level: 5, hp: 19, maxHp: 19, status: null }],
    bag: [{ name: "Potion", quantity: 2 }],
    badges: { owned: ["Boulder"] },
    battle: { active: false, kind: null, opponent: null },
    dialog: { active: true, text: null },
    flags: { values: { hasPokedex: true, hasOaksParcel: true, hasTownMap: true } },
    collision: {
      mapId: 0,
      mapName: "Pallet Town",
      width: 0,
      height: 0,
      grid: [],
      playerTile: { x: 5, y: 6 },
      passableDirections: ["up", "left", "right"],
    },
    parserWarnings: [],
  },
  screenshot: {
    pngBase64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
    width: 1,
    height: 1,
  },
  lastAction: null,
  parserWarnings: [],
})

const curatedObservation = ObservationSchema.parse({
  type: "observation",
  timestamp: "2026-06-04T00:00:01.000Z",
  frame: 2,
  state: {
    emulator: { frame: 2, romLoaded: true, saveStateLoaded: true },
    player: { name: "RED", tile: { x: 5, y: 6 }, facing: "up" },
    map: { id: 0, name: "Pallet Town" },
    party: [
      {
        species: "Squirtle",
        level: 5,
        hp: 19,
        maxHp: 19,
        status: "OK",
      },
    ],
    bag: [{ name: "Potion", quantity: 2 }],
    badges: { owned: ["Boulder"] },
    battle: { active: false, kind: null, opponent: null },
    dialog: { active: true, text: "OAK: Deliver the parcel." },
    flags: {
      values: {
        hasPokedex: true,
        hasOaksParcel: true,
        hasTownMap: false,
      },
    },
    collision: {
      mapId: 0,
      mapName: "Pallet Town",
      width: 0,
      height: 0,
      grid: [],
      playerTile: { x: 5, y: 6 },
      passableDirections: ["up", "left"],
    },
    parserWarnings: ["unknown item 250"],
  },
  screenshot: {
    pngBase64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
    width: 1,
    height: 1,
  },
  lastAction: null,
  parserWarnings: ["unknown item 250"],
})

const curatedAgentObservation = {
  ...curatedObservation,
  gridScreenshot: {
    pngBase64:
      "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAJCAYAAAALpr0TAAAAI0lEQVR4AY3BAQEAAAiAIHN9r+uCMLd7BBJJJJFEEkkkkUQPbjEDIDjX95IAAAAASUVORK5CYII=",
    width: 10,
    height: 9,
  },
}

describe("renderObservation", () => {
  test("renders curated helper text from structured state", async () => {
    const rendered = await renderObservation(observation, {
      render: () => Promise.resolve("[image]"),
    })

    expect(rendered).toContain("LOC")
    expect(rendered).toContain("Pallet Town")
    expect(rendered).toContain("5,6")
    expect(rendered).toContain("facing up")
    expect(rendered).toContain("exits up/left/right")
    expect(rendered).toContain("PLAYER RED")
    expect(rendered).toContain("PARTY Squirtle Lv5 19/19")
    expect(rendered).toContain("BAG Potion x2")
    expect(rendered).toContain("BADGES Boulder")
    expect(rendered).toContain("FLAGS")
    expect(rendered).toContain("Pokedex")
    expect(rendered).toContain("Oak's Parcel")
    expect(rendered).toContain("Town Map")
    expect(rendered).toContain("BATTLE none")
    expect(rendered).toContain("field")
    expect(rendered).toContain("DIALOG active")
    expect(rendered).toContain("text box active")
    expect(rendered).toContain("HELP passable up/left/right")
    expect(rendered).toContain("WARN")
    expect(rendered).toContain("none")
  })

  test("uses metadata fallback when image rendering fails", async () => {
    const rendered = await renderObservation(observation, {
      render: () => Promise.reject(new Error("terminal image failed")),
    })

    expect(rendered).toContain("[screenshot unavailable: terminal image failed]")
    expect(rendered).toContain("Pallet Town")
    expect(rendered).toContain("RED")
  })

  test("writeObservationFrame appends observations without clearing scrollback", async () => {
    const chunks: string[] = []
    const writer = {
      write: (chunk: string): void => {
        chunks.push(chunk)
      },
    }

    await writeObservationFrame(observation, writer, {
      render: () => Promise.resolve("[first image]"),
    })
    await writeObservationFrame(observation, writer, {
      render: () => Promise.resolve("[second image]"),
    })

    const output = chunks.join("")
    expect(output).not.toContain("\x1Bc")
    expect(output).toContain("[first image]")
    expect(output).toContain("[second image]")
    expect(output.match(/LOC/g)?.length).toBe(2)
  })

  test("writeObservationFrame does not clear before native images so scrollback remains intact", async () => {
    const chunks: string[] = []
    const writer = {
      write: (chunk: string): void => {
        chunks.push(chunk)
      },
    }

    await writeObservationFrame(observation, writer, {
      render: () => {
        writer.write("[native image]")
        return Promise.resolve("")
      },
    })

    const output = chunks.join("")
    expect(output).not.toContain("\x1Bc")
    expect(output).toStartWith("[native image]")
    expect(output).toContain("Pallet Town")
  })

  test("uses a compact terminal image height by default when terminal rows are unknown", async () => {
    const renderOptions: unknown[] = []

    const rendered = await withStdoutRows(undefined, () =>
      renderObservation(observation, {
        render: (_payload, options) => {
          renderOptions.push(options)
          return Promise.resolve("[image]")
        },
      }),
    )

    expect(rendered).toContain("[image]")
    expect(renderOptions).toEqual([{ height: 16, preserveAspectRatio: true }])
  })

  test("caps the terminal image height for tall terminals", async () => {
    const renderOptions: unknown[] = []

    const rendered = await withStdoutRows(60, () =>
      renderObservation(observation, {
        render: (_payload, options) => {
          renderOptions.push(options)
          return Promise.resolve("[image]")
        },
      }),
    )

    expect(rendered).toContain("[image]")
    expect(renderOptions).toEqual([{ height: 16, preserveAspectRatio: true }])
  })

  test("keeps the observation frame within a short terminal when rows are known", async () => {
    const renderOptions: unknown[] = []

    const rendered = await withStdoutRows(24, () =>
      renderObservation(observation, {
        render: (_payload, options) => {
          renderOptions.push(options)
          return Promise.resolve("[image]")
        },
      }),
    )

    expect(rendered).toContain("[image]")
    expect(renderOptions).toEqual([{ height: 12, preserveAspectRatio: true }])
  })

  test("shows curated helper lines for parsed RAM state", async () => {
    const rendered = await renderObservation(curatedObservation, {
      render: () => Promise.resolve("[image]"),
    })

    expect(rendered).toContain("[image]")
    expect(rendered).toContain("LOC")
    expect(rendered).toContain("Pallet Town")
    expect(rendered).toContain("tile 5,6")
    expect(rendered).toContain("facing up")
    expect(rendered).toContain("PLAYER RED")
    expect(rendered).toContain("PARTY Squirtle Lv5 19/19 OK")
    expect(rendered).toContain("BAG Potion x2")
    expect(rendered).toContain("BADGES Boulder")
    expect(rendered).toContain("BATTLE none")
    expect(rendered).toContain("DIALOG active")
    expect(rendered).toContain("HELP")
    expect(rendered).toContain("passable up/left")
    expect(rendered).toContain("FLAGS")
    expect(rendered).toContain("Pokedex")
    expect(rendered).toContain("Oak's Parcel")
    expect(rendered).toContain("hasPokedex")
    expect(rendered).toContain("hasOaksParcel")
    expect(rendered).toContain("!hasTownMap")
    expect(rendered).toContain("WARN unknown item 250")
  })

  test("renderObservation shows OK status for healthy RAM party members", async () => {
    const rendered = await renderObservation(observation, {
      render: () => Promise.resolve("[image]"),
    })

    expect(rendered).toContain("PARTY Squirtle Lv5 19/19 OK")
  })

  test("shows model-visible text and the composite terminal model image", async () => {
    const rendered = await renderObservation(curatedAgentObservation, {
      render: () => Promise.resolve("[image]"),
    })
    const visibleRendered = stripAnsi(rendered)

    expect(visibleRendered).toContain("MODEL TEXT")
    expect(visibleRendered).toContain("Observation summary:")
    expect(visibleRendered).toContain("LOC Pallet Town tile 5,6 facing up exits up/left")
    expect(visibleRendered).toContain("HELP passable up/left")
    expect(visibleRendered.match(/LOC Pallet Town/g)?.length).toBe(1)
    expect(visibleRendered).toContain(
      "MODEL IMAGE screenshot + grid overlay PNG 1x1 + 10x9 image/png",
    )
  })
})

function stripAnsi(value: string): string {
  const ansiSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g")
  return value.replace(ansiSequence, "")
}

async function withStdoutRows<T>(rows: number | undefined, callback: () => Promise<T>): Promise<T> {
  const previousRows = process.stdout.rows
  Object.defineProperty(process.stdout, "rows", {
    configurable: true,
    value: rows,
  })
  try {
    return await callback()
  } finally {
    Object.defineProperty(process.stdout, "rows", {
      configurable: true,
      value: previousRows,
    })
  }
}
