import { describe, expect, test } from "bun:test"
import type { AgentObservation } from "./agent-observation-types"
import { observationFixture } from "./agent-test-fixtures"
import { renderObservation } from "./renderer"

describe("renderObservation terminal frame", () => {
  test("renders the full per-turn model observation payload with one terminal image", async () => {
    const renderCalls: string[] = []
    const rendered = await renderObservation(observationFixture, {
      render: (payload) => {
        renderCalls.push(Buffer.from(payload).toString("base64"))
        return Promise.resolve(`[model image ${renderCalls.length}]`)
      },
    })

    expect(renderCalls).toHaveLength(1)
    expect(rendered).toStartWith("\nMODEL IMAGE")
    expect(rendered).toContain("MODEL TEXT")
    expect(rendered).toContain("Fresh Pokemon harness observation.")
    expect(rendered).toContain("Observation summary:")
    expect(rendered).toContain("LOC Pallet Town tile 5,6 facing up exits up/left")
    expect(rendered).toContain("HELP passable up/left")
    expect(rendered).toContain("COLLISION")
    expect(rendered).toContain("Image 1: current game screenshot.")
    expect(rendered).toContain("Image 2: grid/collision overlay screenshot.")
    expect(rendered).toContain("MODEL IMAGE screenshot + grid overlay PNG 1x1 + 1x1 image/png")
    expect(rendered).toContain("[model image 1]")
    expect(rendered).not.toContain("MODEL IMAGE 1")
    expect(rendered).not.toContain("MODEL IMAGE 2")
    expect(rendered.match(/LOC Pallet Town/g)?.length).toBe(1)
    expect(rendered).toContain("PARTY Squirtle Lv5 19/19 OK")
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

    expect(rendered).toContain("MODEL IMAGE screenshot + grid overlay PNG 1x1 + 1x1 image/png")
    expect(rendered).not.toContain("unknown-size")
  })

  test("reserves rows after native terminal graphics so labels do not overlap images", async () => {
    const rendered = await withStdoutRows(24, () =>
      renderObservation(observationFixture, {
        render: () => Promise.resolve("\u001B_Gnative-composite\u001B\\"),
      }),
    )

    expect(newlineCountBetween(rendered, "native-composite", "MODEL TEXT")).toBeGreaterThanOrEqual(
      12,
    )
  })

  test("does not add a large gap after direct native terminal image draws", async () => {
    const rendered = await withStdoutRows(24, () =>
      renderObservation(observationFixture, {
        render: () => Promise.resolve(""),
      }),
    )

    expect(newlineCountBetween(rendered, "image/png", "MODEL TEXT")).toBeLessThanOrEqual(2)
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
