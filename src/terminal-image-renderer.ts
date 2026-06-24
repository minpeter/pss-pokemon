import { Jimp, ResizeStrategy } from "jimp"
import terminalImage from "terminal-image"

export interface ObservationImageRenderer {
  render(payload: Uint8Array, options: ImageRenderOptions): Promise<string>
}

export interface ImageRenderOptions {
  readonly height: number
  readonly preserveAspectRatio: boolean
}

interface ImageSize {
  readonly width: number
  readonly height: number
}

interface RgbaPixel {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

interface NativeImageRenderOptions extends ImageRenderOptions {
  readonly preferNativeRender: boolean
}

type NativeImageRenderer = (
  payload: Uint8Array,
  options: NativeImageRenderOptions,
) => Promise<string>

const HALF_BLOCK = "\u2584"
const RESET = "\u001B[0m"
const RGBA_CHANNELS_PER_PIXEL = 4
const TERMINAL_PIXELS_PER_ROW = 2

export const terminalObservationImageRenderer: ObservationImageRenderer =
  createObservationImageRenderer()

export function createObservationImageRenderer(
  nativeImageRenderer: NativeImageRenderer = renderNativeTerminalImage,
): ObservationImageRenderer {
  return {
    render: async (payload, options) => {
      const nativeOutput = await captureStdoutWrites(() =>
        nativeImageRenderer(payload, {
          ...options,
          preferNativeRender: true,
        }),
      )
      if (usesNativeTerminalGraphics(nativeOutput)) {
        return nativeOutput
      }
      if (!supportsAnsiColor()) {
        return nativeOutput
      }
      return renderTruecolorAnsiScreenshot(payload, options)
    },
  }
}

async function renderNativeTerminalImage(
  payload: Uint8Array,
  options: NativeImageRenderOptions,
): Promise<string> {
  return terminalImage.buffer(Buffer.from(payload), options)
}

async function captureStdoutWrites(render: () => Promise<string>): Promise<string> {
  let capturedOutput = ""
  const originalWrite = process.stdout.write
  process.stdout.write = ((chunk, encodingOrCallback, callback) => {
    capturedOutput += stdoutChunkToString(chunk)
    stdoutWriteCallback(encodingOrCallback, callback)?.()
    return true
  }) as typeof process.stdout.write
  try {
    const returnedOutput = await render()
    return `${capturedOutput}${returnedOutput}`
  } finally {
    process.stdout.write = originalWrite
  }
}

function stdoutChunkToString(chunk: string | Uint8Array): string {
  return typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")
}

function stdoutWriteCallback(
  encodingOrCallback: BufferEncoding | ((error?: Error | null) => void) | undefined,
  callback: ((error?: Error | null) => void) | undefined,
): ((error?: Error | null) => void) | undefined {
  return typeof encodingOrCallback === "function" ? encodingOrCallback : callback
}

function usesNativeTerminalGraphics(output: string): boolean {
  return output.length === 0 || output.includes("\u001B_G") || output.includes("\u001B]1337;")
}

function supportsAnsiColor(): boolean {
  const forceColor = process.env["FORCE_COLOR"]
  if (forceColor !== undefined) {
    return forceColor !== "0"
  }
  if (process.env["NO_COLOR"] !== undefined) {
    return false
  }

  const term = process.env["TERM"] ?? ""
  if (term.length === 0 || term === "dumb") {
    return false
  }

  const colorTerm = process.env["COLORTERM"]?.toLowerCase()
  if (colorTerm === "truecolor" || colorTerm === "24bit") {
    return true
  }

  return (
    term.includes("256color") ||
    term.includes("color") ||
    term.startsWith("xterm") ||
    term.startsWith("screen") ||
    term.startsWith("tmux") ||
    term.startsWith("rxvt")
  )
}

export async function renderTruecolorAnsiScreenshot(
  payload: Uint8Array,
  options: ImageRenderOptions,
): Promise<string> {
  const image = await Jimp.fromBuffer(Buffer.from(payload))
  const size = fitToTerminalRows(image.bitmap.width, image.bitmap.height, options)
  image.resize({ w: size.width, h: size.height, mode: ResizeStrategy.NEAREST_NEIGHBOR })
  return renderHalfBlockRows(image.bitmap.data, image.bitmap.width, image.bitmap.height)
}

function fitToTerminalRows(
  sourceWidth: number,
  sourceHeight: number,
  options: ImageRenderOptions,
): ImageSize {
  const requestedHeight = evenPixelHeight(Math.max(TERMINAL_PIXELS_PER_ROW, options.height * 2))
  if (!options.preserveAspectRatio) {
    return { width: sourceWidth, height: requestedHeight }
  }

  const requestedWidth = Math.max(1, Math.round((sourceWidth * requestedHeight) / sourceHeight))
  const terminalColumns = process.stdout.columns
  if (terminalColumns === undefined || terminalColumns <= 0 || requestedWidth <= terminalColumns) {
    return { width: requestedWidth, height: requestedHeight }
  }

  const constrainedHeight = Math.max(
    TERMINAL_PIXELS_PER_ROW,
    Math.round((sourceHeight * terminalColumns) / sourceWidth),
  )
  return { width: terminalColumns, height: evenPixelHeight(constrainedHeight) }
}

function evenPixelHeight(height: number): number {
  return height % TERMINAL_PIXELS_PER_ROW === 0 ? height : height + 1
}

function renderHalfBlockRows(data: Uint8Array, width: number, height: number): string {
  const rows: string[] = []
  for (let y = 0; y < height; y += TERMINAL_PIXELS_PER_ROW) {
    let line = ""
    for (let x = 0; x < width; x += 1) {
      const top = readPixel(data, width, x, y)
      const bottom = y + 1 < height ? readPixel(data, width, x, y + 1) : transparentPixel()
      line += renderHalfBlock(top, bottom)
    }
    rows.push(`${line}${RESET}`)
  }
  return rows.join("\n")
}

function renderHalfBlock(top: RgbaPixel, bottom: RgbaPixel): string {
  if (top.alpha === 0 && bottom.alpha === 0) {
    return " "
  }
  if (top.alpha === 0) {
    return `${foreground(bottom)}${HALF_BLOCK}${RESET}`
  }
  if (bottom.alpha === 0) {
    return `${background(top)} ${RESET}`
  }
  return `${background(top)}${foreground(bottom)}${HALF_BLOCK}${RESET}`
}

function readPixel(data: Uint8Array, width: number, x: number, y: number): RgbaPixel {
  const offset = (y * width + x) * RGBA_CHANNELS_PER_PIXEL
  return {
    red: readChannel(data, offset),
    green: readChannel(data, offset + 1),
    blue: readChannel(data, offset + 2),
    alpha: readChannel(data, offset + 3),
  }
}

function readChannel(data: Uint8Array, offset: number): number {
  const channel = data[offset]
  if (channel === undefined) {
    throw new InvalidBitmapDataError(offset)
  }
  return channel
}

function transparentPixel(): RgbaPixel {
  return { red: 0, green: 0, blue: 0, alpha: 0 }
}

function foreground(pixel: RgbaPixel): string {
  return `\u001B[38;2;${pixel.red};${pixel.green};${pixel.blue}m`
}

function background(pixel: RgbaPixel): string {
  return `\u001B[48;2;${pixel.red};${pixel.green};${pixel.blue}m`
}

class InvalidBitmapDataError extends Error {
  constructor(readonly offset: number) {
    super(`bitmap data ended before RGBA channel ${offset}`)
    this.name = "InvalidBitmapDataError"
  }
}
