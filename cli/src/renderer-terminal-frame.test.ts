import { describe, expect, test } from "bun:test"
import { Jimp, JimpMime } from "jimp"
import { createObservedAgentInput } from "./agent-observation"
import type { AgentObservation } from "./agent-observation-types"
import { observationFixture } from "./agent-test-fixtures"
import { renderObservation } from "./renderer"
import type { Observation, Screenshot } from "./schemas"

describe("renderObservation terminal frame", () => {
  test("renders the full per-turn model observation payload with one terminal image", async () => {
    const renderCalls: string[] = []
    const rendered = await renderObservation(observationFixture, {
      render: (payload) => {
        renderCalls.push(Buffer.from(payload).toString("base64"))
        return Promise.resolve(`[model image ${renderCalls.length}]`)
      },
    })
    const visibleRendered = stripAnsi(rendered)

    expect(renderCalls).toHaveLength(1)
    expect(visibleRendered).toStartWith("\nMODEL IMAGE")
    expect(visibleRendered).toContain("MODEL TEXT")
    expect(visibleRendered).toContain("Fresh Pokemon harness observation.")
    expect(visibleRendered).toContain("Observation summary:")
    expect(visibleRendered).toContain("LOC Pallet Town tile 5,6 facing up exits up/left")
    expect(visibleRendered).toContain("HELP passable up/left")
    expect(visibleRendered).toContain("COLLISION")
    expect(visibleRendered).toContain("Image 1: current game screenshot.")
    expect(visibleRendered).toContain("Image 2: grid/collision overlay screenshot.")
    expect(visibleRendered).toContain(
      "MODEL IMAGE screenshot + grid overlay PNG 1x1 + 1x1 image/png",
    )
    expect(visibleRendered).toContain("[model image 1]")
    expect(visibleRendered).not.toContain("MODEL IMAGE 1")
    expect(visibleRendered).not.toContain("MODEL IMAGE 2")
    expect(visibleRendered.match(/LOC Pallet Town/g)?.length).toBe(1)
    expect(visibleRendered).toContain("PARTY Squirtle Lv5 19/19 OK")
  })

  test("reads terminal model image sizes from PNG data when metadata is missing", async () => {
    const observationWithoutMetadata: AgentObservation = {
      ...observationFixture,
      gridScreenshot: { pngBase64: observationFixture.gridScreenshot.pngBase64 },
      screenshot: { pngBase64: observationFixture.screenshot.pngBase64 },
    }

    const rendered = await renderObservation(observationWithoutMetadata, {
      render: () => Promise.resolve("[model image]"),
    })
    const visibleRendered = stripAnsi(rendered)

    expect(visibleRendered).toContain(
      "MODEL IMAGE screenshot + grid overlay PNG 1x1 + 1x1 image/png",
    )
    expect(visibleRendered).not.toContain("unknown-size")
  })

  test("reserves scaled rows after native terminal graphics so labels do not overlap images", async () => {
    const rendered = await withStdoutRows(24, () =>
      renderObservation(observationFixture, {
        render: () => Promise.resolve("\u001B]1337;File=inline=1:native-composite\u0007"),
      }),
    )

    expect(newlineCountBetween(rendered, "native-composite", "MODEL TEXT")).toBeGreaterThanOrEqual(
      6,
    )
  })

  test("does not reserve extra rows after Kitty graphics", async () => {
    const rendered = await withStdoutRows(24, () =>
      renderObservation(observationFixture, {
        render: () => Promise.resolve("\u001B_Gnative-composite\u001B\\"),
      }),
    )

    expect(newlineCountBetween(rendered, "native-composite", "MODEL TEXT")).toBeLessThanOrEqual(2)
  })

  test("does not add a large gap after direct native terminal image draws", async () => {
    const rendered = await withStdoutRows(24, () =>
      renderObservation(observationFixture, {
        render: () => Promise.resolve(""),
      }),
    )

    expect(newlineCountBetween(rendered, "image/png", "MODEL TEXT")).toBeLessThanOrEqual(2)
  })

  test("adds a blank line after the terminal model image", async () => {
    const rendered = await renderObservation(observationFixture, {
      render: () => Promise.resolve("[model image]"),
    })

    expect(rendered).toContain("[model image]\n\nMODEL TEXT")
  })

  test("keeps collision map text exactly as the model receives it", async () => {
    const observation = {
      ...observationFixture,
      state: {
        ...observationFixture.state,
        collision: {
          ...observationFixture.state.collision,
          ascii:
            "A B C D E F G H I J\n5 . . . . @ . . . . .\n\n@ you (E5) . walkable # blocked\nup=row-1 down=row+1 left=col-1 right=col+1",
        },
      },
    }

    const rendered = await renderObservation(observation, {
      render: () => Promise.resolve("[image]"),
    })

    expect(rendered.match(/@ you \(E5\)/g)?.length).toBe(1)
    expect(rendered.match(/up=row-1/g)?.length).toBe(1)
  })

  test("renders 4x grid model display at 2x while keeping model input at 4x", async () => {
    const screenshot = await createScreenshot(2, 1, 0xff0000ff)
    const gridScreenshot = await createScreenshot(8, 4, 0x00ff00ff)
    const observation: AgentObservation = {
      ...observationFixture,
      gridScreenshot,
      screenshot,
    }
    const displayPayloads: Uint8Array[] = []
    const displayOptions: unknown[] = []

    await renderObservation(observation, {
      render: (payload, options) => {
        displayPayloads.push(payload)
        displayOptions.push(options)
        return Promise.resolve("[model image]")
      },
    })
    const displayImage = await Jimp.fromBuffer(Buffer.from(displayPayloads[0] ?? new Uint8Array()))
    const modelInput = createObservedAgentInput({
      observation,
      text: "Fresh observation before turn 1.",
    })

    expect(displayImage.bitmap.width).toBe(12)
    expect(displayImage.bitmap.height).toBe(2)
    expect(displayOptions).toEqual([{ height: 8, preserveAspectRatio: true }])
    expect(modelInput[2]).toEqual({
      image: `data:image/png;base64,${gridScreenshot.pngBase64}`,
      mediaType: "image/png",
      type: "image",
    })
  })

  test("leaves screenshot-only terminal display payload unscaled", async () => {
    const screenshot = await createScreenshot(2, 1, 0xff0000ff)
    const { gridScreenshot: _gridScreenshot, ...baseObservation } = observationFixture
    const observation: Observation = {
      ...baseObservation,
      screenshot,
    }
    const displayPayloads: Uint8Array[] = []

    await renderObservation(observation, {
      render: (payload) => {
        displayPayloads.push(payload)
        return Promise.resolve("[model image]")
      },
    })
    const displayImage = await Jimp.fromBuffer(Buffer.from(displayPayloads[0] ?? new Uint8Array()))

    expect(displayImage.bitmap.width).toBe(2)
    expect(displayImage.bitmap.height).toBe(1)
  })
})

function newlineCountBetween(output: string, left: string, right: string): number {
  const leftIndex = output.indexOf(left)
  const rightIndex = output.indexOf(right)
  if (leftIndex < 0 || rightIndex < 0 || rightIndex <= leftIndex) {
    return -1
  }
  const between = output.slice(leftIndex + left.length, rightIndex)
  return between.match(/\n/g)?.length ?? 0
}

function stripAnsi(value: string): string {
  const ansiSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g")
  return value.replace(ansiSequence, "")
}

async function withStdoutRows<T>(rows: number, callback: () => Promise<T>): Promise<T> {
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

async function createScreenshot(width: number, height: number, color: number): Promise<Screenshot> {
  const image = new Jimp({ width, height, color })
  const bytes = await image.getBuffer(JimpMime.png)
  return {
    height,
    pngBase64: Buffer.from(bytes).toString("base64"),
    width,
  }
}
