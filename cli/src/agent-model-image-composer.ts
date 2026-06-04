import { Jimp, JimpMime, ResizeStrategy } from "jimp"
import type { Screenshot } from "./schemas"

export const MODEL_DISPLAY_IMAGE_GAP_PIXELS = 8

const MODEL_DISPLAY_BACKGROUND = 0x000000ff

interface ComposeModelDisplayImageOptions {
  readonly screenshot: Screenshot
  readonly gridScreenshot?: Screenshot
}

export interface ScreenshotPixelSize {
  readonly height: number
  readonly width: number
}

type JimpImage = Awaited<ReturnType<typeof Jimp.fromBuffer>>

export async function composeModelDisplayImage({
  screenshot,
  gridScreenshot,
}: ComposeModelDisplayImageOptions): Promise<Uint8Array> {
  const screenshotBytes = decodeScreenshot(screenshot)
  if (gridScreenshot === undefined) {
    return screenshotBytes
  }

  const rawScreenshotImage = await Jimp.fromBuffer(Buffer.from(screenshotBytes))
  const rawGridImage = await loadScreenshot(gridScreenshot)
  const targetHeight = Math.max(rawScreenshotImage.bitmap.height, rawGridImage.bitmap.height)
  const screenshotImage = normalizeImageHeight(rawScreenshotImage, targetHeight)
  const gridImage = normalizeImageHeight(rawGridImage, targetHeight)
  const width =
    screenshotImage.bitmap.width + MODEL_DISPLAY_IMAGE_GAP_PIXELS + gridImage.bitmap.width
  const height = targetHeight
  const output = new Jimp({ width, height, color: MODEL_DISPLAY_BACKGROUND })

  output.composite(screenshotImage, 0, centeredOffset(height, screenshotImage.bitmap.height))
  output.composite(
    gridImage,
    screenshotImage.bitmap.width + MODEL_DISPLAY_IMAGE_GAP_PIXELS,
    centeredOffset(height, gridImage.bitmap.height),
  )

  return output.getBuffer(JimpMime.png)
}

export async function composeTerminalDisplayImage({
  screenshot,
  gridScreenshot,
}: ComposeModelDisplayImageOptions): Promise<Uint8Array> {
  const payload = await composeModelDisplayImage({
    screenshot,
    ...(gridScreenshot === undefined ? {} : { gridScreenshot }),
  })
  if (gridScreenshot === undefined) {
    return payload
  }
  return downscalePng(payload, 2)
}

async function loadScreenshot(screenshot: Screenshot): Promise<JimpImage> {
  return Jimp.fromBuffer(Buffer.from(decodeScreenshot(screenshot)))
}

export async function readScreenshotPixelSize(
  screenshot: Screenshot,
): Promise<ScreenshotPixelSize> {
  const { height, width } = screenshot
  if (width !== undefined && height !== undefined) {
    return { height, width }
  }

  const image = await loadScreenshot(screenshot)
  return { height: image.bitmap.height, width: image.bitmap.width }
}

function decodeScreenshot(screenshot: Screenshot): Uint8Array {
  return Buffer.from(screenshot.pngBase64, "base64")
}

function normalizeImageHeight(image: JimpImage, targetHeight: number): JimpImage {
  if (image.bitmap.height === targetHeight) {
    return image
  }

  const targetWidth = Math.max(
    1,
    Math.round((image.bitmap.width * targetHeight) / image.bitmap.height),
  )
  image.resize({ w: targetWidth, h: targetHeight, mode: ResizeStrategy.NEAREST_NEIGHBOR })
  return image
}

async function downscalePng(payload: Uint8Array, divisor: number): Promise<Uint8Array> {
  const image = await Jimp.fromBuffer(Buffer.from(payload))
  const width = Math.max(1, Math.round(image.bitmap.width / divisor))
  const height = Math.max(1, Math.round(image.bitmap.height / divisor))
  if (image.bitmap.width === width && image.bitmap.height === height) {
    return payload
  }

  image.resize({ w: width, h: height, mode: ResizeStrategy.NEAREST_NEIGHBOR })
  return image.getBuffer(JimpMime.png)
}

function centeredOffset(containerSize: number, imageSize: number): number {
  return Math.floor((containerSize - imageSize) / 2)
}
