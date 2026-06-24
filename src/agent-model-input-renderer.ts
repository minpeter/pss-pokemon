import chalk from "chalk"
import { composeTerminalDisplayImage, readScreenshotPixelSize } from "./agent-model-image-composer"
import { formatObservedAgentText } from "./agent-observation"
import { hasGridScreenshot } from "./agent-observation-types"
import type { Observation, Screenshot } from "./schemas"
import type { ImageRenderOptions, ObservationImageRenderer } from "./terminal-image-renderer"

const DEFAULT_MODEL_IMAGE_ROWS = 16
const MODEL_TEXT_ROWS = 11
const FRAME_MARGIN_ROWS = 1

export interface RenderAgentModelInputOptions {
  readonly imageRenderer: ObservationImageRenderer
  readonly observation: Observation
  readonly text?: string
}

export async function renderAgentModelInput({
  imageRenderer,
  observation,
  text = "Fresh Pokemon harness observation.",
}: RenderAgentModelInputOptions): Promise<string> {
  const gridScreenshot = hasGridScreenshot(observation) ? observation.gridScreenshot : undefined
  const imageLabel = formatModelDisplayImageLabel(gridScreenshot)
  const imageSize = await formatModelDisplayImageSize(observation.screenshot, gridScreenshot)

  return [
    "",
    `${chalk.cyanBright("MODEL IMAGE")} ${imageLabel} PNG ${imageSize} image/png`,
    await renderModelImage({
      imageRenderer,
      label: imageLabel,
      options: modelImageRenderOptions(gridScreenshot),
      createPayload: () =>
        composeTerminalDisplayImage({
          screenshot: observation.screenshot,
          ...(gridScreenshot === undefined ? {} : { gridScreenshot }),
        }),
    }),
    chalk.cyanBright("MODEL TEXT"),
    formatObservedAgentText({ observation, text }),
  ].join("\n")
}

async function renderModelImage({
  imageRenderer,
  label,
  options,
  createPayload,
}: {
  readonly imageRenderer: ObservationImageRenderer
  readonly label: string
  readonly options: ImageRenderOptions
  readonly createPayload: () => Promise<Uint8Array>
}): Promise<string> {
  try {
    const rendered = await imageRenderer.render(await createPayload(), options)
    return appendImageSeparator(reserveRowsAfterNativeTerminalGraphics(rendered, options.height))
  } catch (error) {
    if (error instanceof Error) {
      return chalk.gray(`[${label} unavailable: ${error.message}]`)
    }
    throw error
  }
}

function reserveRowsAfterNativeTerminalGraphics(output: string, rows: number): string {
  if (output.length === 0) {
    return output
  }
  if (!usesNativeTerminalGraphics(output)) {
    return output
  }
  if (usesKittyTerminalGraphics(output)) {
    return output
  }
  return `${output}${"\r\n".repeat(Math.max(0, rows - 1))}`
}

function appendImageSeparator(output: string): string {
  return output.length === 0 ? output : `${output}\n`
}

function usesNativeTerminalGraphics(output: string): boolean {
  return output.includes("\u001B_G") || output.includes("\u001B]1337;")
}

function usesKittyTerminalGraphics(output: string): boolean {
  return output.includes("\u001B_G")
}

function modelImageRenderOptions(gridScreenshot: Screenshot | undefined): ImageRenderOptions {
  const sourceRows = modelImageRowsForTerminal(process.stdout.rows)
  return {
    height: gridScreenshot === undefined ? sourceRows : Math.max(1, Math.round(sourceRows / 2)),
    preserveAspectRatio: true,
  }
}

function modelImageRowsForTerminal(terminalRows: number | undefined): number {
  if (terminalRows === undefined || terminalRows <= 0) {
    return DEFAULT_MODEL_IMAGE_ROWS
  }

  const availableRows = terminalRows - MODEL_TEXT_ROWS - FRAME_MARGIN_ROWS
  return Math.max(1, Math.min(DEFAULT_MODEL_IMAGE_ROWS, availableRows))
}

async function formatImageSize(screenshot: Screenshot): Promise<string> {
  const { height, width } = await readScreenshotPixelSize(screenshot)
  return `${width}x${height}`
}

function formatModelDisplayImageLabel(gridScreenshot: Screenshot | undefined): string {
  return gridScreenshot === undefined ? "screenshot" : "screenshot + grid overlay"
}

async function formatModelDisplayImageSize(
  screenshot: Screenshot,
  gridScreenshot: Screenshot | undefined,
): Promise<string> {
  if (gridScreenshot === undefined) {
    return formatImageSize(screenshot)
  }
  const [screenshotSize, gridScreenshotSize] = await Promise.all([
    formatImageSize(screenshot),
    formatImageSize(gridScreenshot),
  ])
  return `${screenshotSize} + ${gridScreenshotSize}`
}
