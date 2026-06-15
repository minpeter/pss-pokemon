import { renderAgentModelInput } from "./agent-model-input-renderer"
import type { Observation } from "./schemas"
import {
  type ImageRenderOptions,
  type ObservationImageRenderer,
  terminalObservationImageRenderer,
} from "./terminal-image-renderer"

export type { ImageRenderOptions, ObservationImageRenderer }
export { terminalObservationImageRenderer }

export interface TextWriter {
  write(chunk: string): void
}

export interface RenderObservationOptions {
  readonly modelInputText?: string
}

const stdoutTextWriter: TextWriter = {
  write: (chunk) => {
    process.stdout.write(chunk)
  },
}

export async function writeObservationFrame(
  observation: Observation,
  writer: TextWriter = stdoutTextWriter,
  imageRenderer: ObservationImageRenderer = terminalObservationImageRenderer,
  options: RenderObservationOptions = {},
): Promise<void> {
  writer.write(`${await renderObservation(observation, imageRenderer, options)}\n`)
}

export async function renderObservation(
  observation: Observation,
  imageRenderer: ObservationImageRenderer = terminalObservationImageRenderer,
  options: RenderObservationOptions = {},
): Promise<string> {
  const renderedModelInput = await renderAgentModelInput({
    imageRenderer,
    observation,
    ...(options.modelInputText === undefined ? {} : { text: options.modelInputText }),
  })
  return renderedModelInput
}
