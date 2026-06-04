import type { AgentEvent } from "@minpeter/pss-runtime"
import chalk from "chalk"
import {
  type ObservationImageRenderer,
  type TextWriter,
  terminalObservationImageRenderer,
  writeObservationFrame,
} from "./renderer"
import type { Observation } from "./schemas"

const SPINNER_SYMBOL_FRAMES = ["✦", "✧", "◆", "◇"] as const
const SPINNER_DOT_FRAMES = [".", "..", "..."] as const

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
  #lastFrameRows = 0
  #lastSpinnerLength = 0
  #spinnerFrame = 0
  #spinnerTimer: ReturnType<typeof setInterval> | null = null
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
    await this.#writeFrame(`\n${chalk.cyan("TURN")} ${turn}\n`, observation, {
      modelInputText: `Fresh Pokemon harness observation before turn ${turn}.`,
    })
  }

  async showActionObservation(observation: Observation, turn: number): Promise<void> {
    this.stopSpinner()
    this.#writeTransient(`\n${chalk.green("AFTER ACTION")} ${turn} frame ${observation.frame}\n`)
  }

  startSpinner(message: string): void {
    this.stopSpinner()
    this.#spinnerFrame = 0
    if (message === "agent thinking") {
      this.#writeTransient("\n")
    }
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
        return
      case "assistant-text":
        this.stopSpinner()
        this.#writeTransient(event.text)
        return
      case "runtime-input":
        this.startSpinner("agent thinking")
        return
      case "step-start":
      case "turn-start":
        this.startSpinner("agent thinking")
        return
      case "tool-call":
        this.stopSpinner()
        this.#writeTransient(
          `${chalk.yellow("ACTION")} ${event.toolName} ${JSON.stringify(event.input)}\n`,
        )
        return
      case "tool-result":
        this.stopSpinner()
        this.#writeTransient(
          `${chalk.green("DONE")} ${event.toolName} ${JSON.stringify(event.output)}\n`,
        )
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
    options: { readonly modelInputText?: string } = {},
  ): Promise<void> {
    this.#clearPreviousFrame()
    let frameRows = 0
    let hasOpenRow = false
    const countingWriter: TextWriter = {
      write: (chunk) => {
        const counted = countTerminalRows({ chunk, hasOpenRow })
        frameRows += counted.rows
        hasOpenRow = counted.hasOpenRow
        this.#writer.write(chunk)
      },
    }
    countingWriter.write(header)
    await writeObservationFrame(observation, countingWriter, this.#imageRenderer, options)
    this.#lastFrameRows = frameRows + (hasOpenRow ? 1 : 0)
    this.#transientRows = 0
  }

  #clearPreviousFrame(): void {
    if (!this.#redrawFrames || this.#lastFrameRows === 0) {
      return
    }
    this.#writer.write(`\u001B[${this.#lastFrameRows + this.#transientRows}A\u001B[J`)
    this.#lastFrameRows = 0
    this.#transientRows = 0
  }

  #writeTransient(chunk: string): void {
    this.#writer.write(chunk)
    if (this.#redrawFrames && this.#lastFrameRows > 0) {
      this.#transientRows += countLineAdvances(chunk)
    }
  }
}

function countLineAdvances(chunk: string): number {
  return chunk.match(/\n/g)?.length ?? 0
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

function assertNever(value: never): never {
  throw new UnhandledAgentTerminalEventError(value)
}

class UnhandledAgentTerminalEventError extends Error {
  constructor(readonly value: never) {
    super(`unhandled agent terminal event: ${JSON.stringify(value)}`)
    this.name = "UnhandledAgentTerminalEventError"
  }
}
