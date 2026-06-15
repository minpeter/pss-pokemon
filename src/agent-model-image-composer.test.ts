import { describe, expect, test } from "bun:test"
import { Jimp, JimpMime } from "jimp"
import {
  composeModelDisplayImage,
  MODEL_DISPLAY_IMAGE_GAP_PIXELS,
} from "./agent-model-image-composer"
import type { Screenshot } from "./schemas"

describe("composeModelDisplayImage", () => {
  test("returns the screenshot bytes when no grid overlay exists", async () => {
    const screenshot = await createScreenshot(2, 1, 0xff0000ff)

    const output = await composeModelDisplayImage({ screenshot })

    expect(Buffer.from(output).equals(Buffer.from(screenshot.pngBase64, "base64"))).toBe(true)
  })

  test("normalizes image heights before stitching screenshot and grid overlay", async () => {
    const screenshot = await createScreenshot(2, 1, 0xff0000ff)
    const gridScreenshot = await createScreenshot(4, 2, 0x00ff00ff)

    const output = await composeModelDisplayImage({ screenshot, gridScreenshot })
    const image = await Jimp.fromBuffer(Buffer.from(output))

    expect(image.bitmap.width).toBe(4 + MODEL_DISPLAY_IMAGE_GAP_PIXELS + 4)
    expect(image.bitmap.height).toBe(2)
  })
})

async function createScreenshot(width: number, height: number, color: number): Promise<Screenshot> {
  const image = new Jimp({ width, height, color })
  const bytes = await image.getBuffer(JimpMime.png)
  return {
    pngBase64: Buffer.from(bytes).toString("base64"),
    width,
    height,
  }
}
