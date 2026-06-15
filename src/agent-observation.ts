import type { UserMessageContentPart } from "@minpeter/pss-runtime"
import type { AgentObservation } from "./agent-observation-types"
import type { PokemonApiClient } from "./api-client"
import { formatObservationSummaryLines } from "./observation-summary"
import type { Observation, Screenshot } from "./schemas"

export type ObservedAgentInput = readonly UserMessageContentPart[]

export interface AgentObservationInputOptions {
  readonly memoryContext?: string
  readonly observation: AgentObservation
  readonly text: string
}

export interface AgentObservationTextOptions {
  readonly memoryContext?: string
  readonly observation: Observation
  readonly text: string
}

export async function captureAgentObservation(client: PokemonApiClient): Promise<AgentObservation> {
  const [state, screenshot, gridScreenshot] = await Promise.all([
    client.state(),
    client.screenshot(),
    client.gridScreenshot(),
  ])

  return {
    frame: state.emulator.frame,
    gridScreenshot,
    lastAction: null,
    parserWarnings: state.parserWarnings,
    screenshot,
    state,
    timestamp: new Date().toISOString(),
    type: "observation",
  }
}

export function createObservedAgentInput({
  memoryContext,
  observation,
  text,
}: AgentObservationInputOptions): ObservedAgentInput {
  return [
    {
      text: createObservedText({
        ...(memoryContext === undefined ? {} : { memoryContext }),
        observation,
        text,
      }),
      type: "text",
    },
    {
      image: createScreenshotDataUrl(observation.screenshot),
      mediaType: "image/png",
      type: "image",
    },
    {
      image: createScreenshotDataUrl(observation.gridScreenshot),
      mediaType: "image/png",
      type: "image",
    },
  ] satisfies ObservedAgentInput
}

function createObservedText({
  memoryContext,
  observation,
  text,
}: AgentObservationInputOptions): string {
  return formatObservedAgentText({
    ...(memoryContext === undefined ? {} : { memoryContext }),
    observation,
    text,
  })
}

export function formatObservedAgentText({
  memoryContext,
  observation,
  text,
}: AgentObservationTextOptions): string {
  return [
    text,
    "",
    "Observation summary:",
    ...formatObservationSummaryLines(observation),
    ...(memoryContext === undefined ? [] : ["", memoryContext]),
    "",
    "Image 1: current game screenshot.",
    "Image 2: grid/collision overlay screenshot.",
    "Use both images and state together. Prefer one clear action, then re-observe.",
  ].join("\n")
}

function createScreenshotDataUrl(screenshot: Screenshot): string {
  return `data:image/png;base64,${screenshot.pngBase64}`
}
