import chalk from "chalk"
import { composeTerminalDisplayImage } from "./agent-model-image-composer"
import { formatObservedAgentText } from "./agent-observation"
import { hasGridScreenshot } from "./agent-observation-types"
import type { TextWriter } from "./renderer"
import type { Observation, Screenshot } from "./schemas"
import type { ObservationImageRenderer } from "./terminal-image-renderer"

const DEFAULT_IMAGE_ROWS = 16
const MAX_IMAGE_ROWS = 18
const MIN_IMAGE_ROWS = 6
const RESERVED_TEXT_ROWS = 7
const LIVE_GRID_DISPLAY_SCALE_DIVISOR = 2
const LIVE_IMAGE_SCALE_NUMERATOR = 3
const LIVE_IMAGE_SCALE_DENOMINATOR = 2

export interface LiveTerminalFrameOptions {
  readonly header: string
  readonly modelInputText?: string
  readonly transcript?: string
}

export async function writeLiveTerminalFrame(
  observation: Observation,
  writer: TextWriter,
  imageRenderer: ObservationImageRenderer,
  options: LiveTerminalFrameOptions,
): Promise<void> {
  writer.write(`${await renderLiveTerminalFrame(observation, imageRenderer, options)}\n`)
}

async function renderLiveTerminalFrame(
  observation: Observation,
  imageRenderer: ObservationImageRenderer,
  {
    header,
    modelInputText = "Fresh Pokemon harness observation.",
    transcript = "",
  }: LiveTerminalFrameOptions,
): Promise<string> {
  const gridScreenshot = hasGridScreenshot(observation) ? observation.gridScreenshot : undefined
  const agentInputText = formatObservedAgentText({ observation, text: modelInputText })
  const imageRows = liveImageRowsForTerminal(process.stdout.rows, transcript, agentInputText)
  return [
    header.trimEnd(),
    formatLocationLine(observation),
    formatStatusLine(observation),
    formatWarningLine(observation),
    ...formatTranscriptLines(transcript),
    "",
    chalk.cyanBright("AGENT INPUT"),
    agentInputText,
    chalk.cyanBright(gridScreenshot === undefined ? "SCREEN" : "SCREEN + GRID"),
    await renderLiveImage({
      imageRenderer,
      rows: imageRows,
      screenshot: observation.screenshot,
      ...(gridScreenshot === undefined ? {} : { gridScreenshot }),
    }),
  ].join("\n")
}

async function renderLiveImage({
  imageRenderer,
  rows,
  screenshot,
  gridScreenshot,
}: {
  readonly imageRenderer: ObservationImageRenderer
  readonly rows: number
  readonly screenshot: Screenshot
  readonly gridScreenshot?: Screenshot
}): Promise<string> {
  const displayRows =
    gridScreenshot === undefined
      ? scaledLiveImageRows(rows)
      : scaledLiveImageRows(Math.max(1, Math.round(rows / LIVE_GRID_DISPLAY_SCALE_DIVISOR)))
  const payload = await composeTerminalDisplayImage({
    screenshot,
    ...(gridScreenshot === undefined ? {} : { gridScreenshot }),
  })
  const rendered = await imageRenderer.render(payload, {
    height: displayRows,
    preserveAspectRatio: true,
  })
  const reserved = reserveRowsAfterNativeTerminalGraphics(rendered, displayRows)
  return usesKittyTerminalGraphics(reserved) ? reserved : appendImageSeparator(reserved)
}

function reserveRowsAfterNativeTerminalGraphics(output: string, rows: number): string {
  if (output.length === 0 || !usesNativeTerminalGraphics(output)) {
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

function liveImageRowsForTerminal(
  rows: number | undefined,
  transcript: string,
  agentInputText: string,
): number {
  if (rows === undefined || rows <= 0) {
    return DEFAULT_IMAGE_ROWS
  }
  const transcriptRows = transcript.split("\n").filter((line) => line.length > 0).length
  const agentInputRows = agentInputText.split("\n").length + 2
  const availableRows = rows - RESERVED_TEXT_ROWS - transcriptRows - agentInputRows
  return Math.max(MIN_IMAGE_ROWS, Math.min(MAX_IMAGE_ROWS, availableRows))
}

function scaledLiveImageRows(rows: number): number {
  return Math.max(1, Math.round((rows * LIVE_IMAGE_SCALE_NUMERATOR) / LIVE_IMAGE_SCALE_DENOMINATOR))
}

function formatLocationLine(observation: Observation): string {
  const player = observation.state.player
  const tile = player.tile === null ? "unknown" : `${player.tile.x},${player.tile.y}`
  const exits = observation.state.collision.passableDirections.join("/") || "none"
  return `${chalk.gray("LOC")} ${observation.state.map.name ?? "unknown"} tile ${tile} facing ${
    player.facing ?? "unknown"
  } exits ${exits}`
}

function formatStatusLine(observation: Observation): string {
  const party = observation.state.party
    .map((member) => {
      const name = member.species ?? "unknown"
      return `${name} Lv${member.level} ${member.hp}/${member.maxHp}${member.status === null ? "" : ` ${member.status}`}`
    })
    .join(", ")
  const battle = observation.state.battle.active ? "battle" : "field"
  const dialog = observation.state.dialog.active ? "dialog" : "no dialog"
  return `${chalk.gray("STATE")} ${party || "no party"} | ${battle} | ${dialog}`
}

function formatWarningLine(observation: Observation): string {
  const warnings =
    observation.parserWarnings.length === 0 ? "none" : observation.parserWarnings.join("; ")
  return `${chalk.gray("WARN")} ${warnings}`
}

function formatTranscriptLines(transcript: string): readonly string[] {
  const trimmed = transcript.trimEnd()
  return trimmed.length === 0 ? [] : ["", ...trimmed.split("\n")]
}
