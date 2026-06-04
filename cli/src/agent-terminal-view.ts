import type { AgentEvent } from "@minpeter/pss-runtime"
import chalk from "chalk"
import {
  type ObservationImageRenderer,
  type TextWriter,
  terminalObservationImageRenderer,
  writeObservationFrame,
} from "./renderer"
import type { Observation } from "./schemas"

const SPINNER_DOT_FRAMES = [".", "..", "..."] as const

const stdoutTextWriter: TextWriter = {
  write: (chunk) => {
    process.stdout.write(chunk)
  },
}

export interface AgentTerminalViewOptions {
  readonly imageRenderer?: ObservationImageRenderer
  readonly writer?: TextWriter
}

export class AgentTerminalView {
  readonly #imageRenderer: ObservationImageRenderer
  readonly #writer: TextWriter
  #lastSpinnerLength = 0
  #spinnerFrame = 0
  #spinnerTimer: ReturnType<typeof setInterval> | null = null

  constructor({
    imageRenderer = terminalObservationImageRenderer,
    writer = stdoutTextWriter,
  }: AgentTerminalViewOptions = {}) {
    this.#imageRenderer = imageRenderer
    this.#writer = writer
  }

  async showObservation(observation: Observation, turn: number): Promise<void> {
    this.stopSpinner()
    this.#writer.write(`\n${chalk.cyan("TURN")} ${turn}\n`)
    await writeObservationFrame(observation, this.#writer, this.#imageRenderer, {
      modelInputText: `Fresh Pokemon harness observation before turn ${turn}.`,
    })
  }

  async showActionObservation(observation: Observation, turn: number): Promise<void> {
    this.stopSpinner()
    this.#writer.write(`\n${chalk.green("AFTER ACTION")} ${turn}\n`)
    await writeObservationFrame(observation, this.#writer, this.#imageRenderer)
  }

  startSpinner(message: string): void {
    this.stopSpinner()
    this.#spinnerFrame = 0
    if (message === "agent thinking") {
      this.#writer.write("\n")
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
        this.#writer.write(event.text)
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
        this.#writer.write(
          `${chalk.yellow("ACTION")} ${event.toolName} ${JSON.stringify(event.input)}\n`,
        )
        return
      case "tool-result":
        this.stopSpinner()
        this.#writer.write(
          `${chalk.green("DONE")} ${event.toolName} ${JSON.stringify(event.output)}\n`,
        )
        this.startSpinner("loading next screen")
        return
      case "turn-error":
        this.stopSpinner()
        this.#writer.write(`${chalk.red("ERROR")} ${event.message}\n`)
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
    const frame = SPINNER_DOT_FRAMES[this.#spinnerFrame % SPINNER_DOT_FRAMES.length]
    this.#spinnerFrame += 1
    const text = `${message}${frame}`
    this.#lastSpinnerLength = text.length
    this.#writer.write(`\r${chalk.dim(text)}`)
  }
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
