import type { AgentEvent } from "@minpeter/pss-runtime"
import chalk from "chalk"
import { formatAgentOutput } from "./agent-output-renderer"
import { formatToolCall } from "./agent-tool-call-renderer"
import { writeLiveTerminalFrame } from "./live-terminal-frame"
import {
  type ObservationImageRenderer,
  type TextWriter,
  terminalObservationImageRenderer,
} from "./renderer"
import type { Observation } from "./schemas"

const SPINNER_SYMBOL_FRAMES = ["✦", "✧", "◆", "◇"] as const
const SPINNER_DOT_FRAMES = [".", "..", "..."] as const
const MAX_TRANSCRIPT_CHARS = 2400

const stdoutTextWriter: TextWriter = {
  write: (chunk) => {
    process.stdout.write(chunk)
  },
}

export interface AgentTerminalViewOptions {
  readonly imageRenderer?: ObservationImageRenderer
  readonly redrawFrames?: boolean
  readonly writer?: TextWriter
}

export class AgentTerminalView {
  readonly #imageRenderer: ObservationImageRenderer
  readonly #redrawFrames: boolean
  readonly #writer: TextWriter
  #lastFrameHadNativeImage = false
  #lastFrameRows = 0
  #lastSpinnerLength = 0
  #persistentTail = ""
  #spinnerFrame = 0
  #spinnerTimer: ReturnType<typeof setInterval> | null = null
  #transientHasOpenRow = false
  #transientRows = 0

  constructor({
    imageRenderer = terminalObservationImageRenderer,
    redrawFrames = process.stdout.isTTY === true,
    writer = stdoutTextWriter,
  }: AgentTerminalViewOptions = {}) {
    this.#imageRenderer = imageRenderer
    this.#redrawFrames = redrawFrames
    this.#writer = writer
  }

  async showObservation(observation: Observation, turn: number): Promise<void> {
    this.stopSpinner()
    await this.#writeFrame(`${chalk.cyan("TURN")} ${turn}\n`, observation, {
      modelInputText: `Fresh Pokemon harness observation before turn ${turn}.`,
      transcript: this.#shouldReplayTranscript() ? this.#persistentTail : "",
    })
  }

  async showActionObservation(_observation: Observation, _turn: number): Promise<void> {
    this.stopSpinner()
    if (this.#transientHasOpenRow || this.#persistentTail.length === 0) {
      this.#writeTransient("\n")
    }
  }

  startSpinner(message: string): void {
    this.stopSpinner()
    this.#spinnerFrame = 0
    this.#renderSpinner(message)
    this.#spinnerTimer = setInterval(() => {
      this.#renderSpinner(message)
    }, 120)
  }

  stopSpinner(): void {
    if (this.#spinnerTimer !== null) {
      clearInterval(this.#spinnerTimer)
      this.#spinnerTimer = null
    }
    if (this.#lastSpinnerLength > 0) {
      this.#writer.write(`\r${" ".repeat(this.#lastSpinnerLength)}\r`)
      this.#lastSpinnerLength = 0
    }
  }

  handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case "assistant-reasoning":
        this.stopSpinner()
        this.#writeTranscript(
          formatAgentOutput(event.text, {
            kind: "reasoning",
            prefixNewline: this.#transientHasOpenRow,
          }),
        )
        return
      case "assistant-text":
        this.stopSpinner()
        this.#writeTranscript(
          formatAgentOutput(event.text, {
            kind: "text",
            prefixNewline: this.#transientHasOpenRow,
          }),
        )
        return
      case "runtime-input":
        this.startSpinner("agent thinking")
        return
      case "turn-start":
        this.#persistentTail = ""
        this.startSpinner("agent thinking")
        return
      case "step-start":
        this.startSpinner("agent thinking")
        return
      case "tool-call":
        this.stopSpinner()
        this.#writeTranscript(
          formatToolCall(event.toolName, event.input, {
            prefixNewline: this.#transientHasOpenRow,
          }),
        )
        return
      case "tool-result":
        this.stopSpinner()
        this.startSpinner("loading next screen")
        return
      case "turn-error":
        this.stopSpinner()
        this.#writeTransient(`${chalk.red("ERROR")} ${event.message}\n`)
        return
      case "step-end":
        this.startSpinner("agent thinking")
        return
      case "turn-abort":
      case "turn-end":
        this.stopSpinner()
        return
      case "user-message":
      case "user-text":
        return
      default:
        assertNever(event)
    }
  }

  #renderSpinner(message: string): void {
    const symbol = SPINNER_SYMBOL_FRAMES[this.#spinnerFrame % SPINNER_SYMBOL_FRAMES.length]
    const dots = SPINNER_DOT_FRAMES[this.#spinnerFrame % SPINNER_DOT_FRAMES.length]
    this.#spinnerFrame += 1
    const text = `${symbol} ${message}${dots}`
    this.#lastSpinnerLength = text.length
    this.#writeTransient(`\r${chalk.cyanBright(symbol)} ${chalk.dim(`${message}${dots}`)}`)
  }

  async #writeFrame(
    header: string,
    observation: Observation,
    options: {
      readonly modelInputText?: string
      readonly transcript?: string
    } = {},
  ): Promise<void> {
    this.#clearPreviousFrame()
    let frameRows = 0
    let hasOpenRow = false
    let hadNativeImage = false
    const countingWriter: TextWriter = {
      write: (chunk) => {
        hadNativeImage = hadNativeImage || usesNativeTerminalGraphics(chunk)
        const counted = countTerminalRows({ chunk, hasOpenRow })
        frameRows += counted.rows
        hasOpenRow = counted.hasOpenRow
        this.#writer.write(chunk)
      },
    }
    await writeLiveTerminalFrame(observation, countingWriter, this.#imageRenderer, {
      header,
      ...(options.modelInputText === undefined ? {} : { modelInputText: options.modelInputText }),
      ...(options.transcript === undefined ? {} : { transcript: options.transcript }),
    })
    this.#lastFrameHadNativeImage = hadNativeImage
    this.#lastFrameRows = frameRows + (hasOpenRow ? 1 : 0)
    this.#transientRows = 0
    this.#transientHasOpenRow = false
  }

  #clearPreviousFrame(): void {
    if (!this.#redrawFrames || this.#lastFrameRows === 0) {
      return
    }
    if (this.#lastFrameHadNativeImage) {
      this.#lastFrameHadNativeImage = false
      this.#lastFrameRows = 0
      this.#transientRows = 0
      this.#transientHasOpenRow = false
      return
    }
    const openTransientRow = this.#transientHasOpenRow ? 1 : 0
    this.#writer.write(
      `\u001B[${this.#lastFrameRows + this.#transientRows + openTransientRow}A\u001B[J`,
    )
    this.#lastFrameRows = 0
    this.#lastFrameHadNativeImage = false
    this.#transientRows = 0
    this.#transientHasOpenRow = false
  }

  #writeTranscript(chunk: string): void {
    this.#persistentTail = trimTranscript(`${this.#persistentTail}${chunk}`)
    this.#writeTransient(chunk)
  }

  #shouldReplayTranscript(): boolean {
    return this.#redrawFrames && this.#lastFrameRows > 0 && !this.#lastFrameHadNativeImage
  }

  #writeTransient(chunk: string): void {
    this.#writer.write(chunk)
    if (this.#redrawFrames && this.#lastFrameRows > 0) {
      const counted = countTerminalRows({ chunk, hasOpenRow: this.#transientHasOpenRow })
      this.#transientRows += counted.rows
      this.#transientHasOpenRow = counted.hasOpenRow
    }
  }
}

function countTerminalRows({
  chunk,
  hasOpenRow,
}: {
  readonly chunk: string
  readonly hasOpenRow: boolean
}): { readonly hasOpenRow: boolean; readonly rows: number } {
  let rows = 0
  let open = hasOpenRow
  for (const char of chunk) {
    if (char === "\n") {
      rows += 1
      open = false
      continue
    }
    if (char !== "\r") {
      open = true
    }
  }
  return { hasOpenRow: open, rows }
}

function usesNativeTerminalGraphics(output: string): boolean {
  return output.includes("\u001B_G") || output.includes("\u001B]1337;")
}

function trimTranscript(transcript: string): string {
  return transcript.slice(-MAX_TRANSCRIPT_CHARS).split("\n").slice(-10).join("\n")
}

function assertNever(value: never): never {
  throw new UnhandledAgentTerminalEventError(value)
}

class UnhandledAgentTerminalEventError extends Error {
  constructor(readonly value: never) {
    super(`unhandled agent terminal event: ${JSON.stringify(value)}`)
    this.name = "UnhandledAgentTerminalEventError"
  }
}
