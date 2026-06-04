import { describe, expect, test } from "bun:test"
import { createObservedAgentInput } from "./agent-observation"
import { observationFixture } from "./agent-test-fixtures"

describe("agent observation input", () => {
  test("creates pss-runtime multipart input with compact state, screenshot, and grid image", () => {
    const input = createObservedAgentInput({
      observation: observationFixture,
      text: "Fresh observation before turn 1.",
    })

    expect(input).toEqual([
      {
        type: "text",
        text: expect.stringContaining("Fresh observation before turn 1."),
      },
      {
        type: "image",
        image: `data:image/png;base64,${observationFixture.screenshot.pngBase64}`,
        mediaType: "image/png",
      },
      {
        type: "image",
        image: `data:image/png;base64,${observationFixture.gridScreenshot.pngBase64}`,
        mediaType: "image/png",
      },
    ])
    expect(input[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining("LOC Pallet Town tile 5,6 facing up exits up/left"),
      }),
    )
    expect(input[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining("HELP passable up/left"),
      }),
    )
    expect(input[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining("COLLISION"),
      }),
    )
    expect(input[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining("Image 1: current game screenshot."),
      }),
    )
    expect(input[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining("Image 2: grid/collision overlay screenshot."),
      }),
    )
  })
})
