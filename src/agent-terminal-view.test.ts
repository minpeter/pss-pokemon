import { afterEach, describe, expect, jest, test } from "bun:test"
import chalk from "chalk"
import { AgentTerminalView } from "./agent-terminal-view"
import { observationFixture } from "./agent-test-fixtures"

const DEFAULT_CHALK_LEVEL = chalk.level

describe("AgentTerminalView", () => {
  afterEach(() => {
    if (jest.isFakeTimers()) {
      jest.clearAllTimers()
    }
    chalk.level = DEFAULT_CHALK_LEVEL
    jest.useRealTimers()
  })

  test("renders agent thinking without a leading blank line", () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    view.startSpinner("agent thinking")
    view.stopSpinner()

    const output = chunks.join("")
    const visibleOutput = stripAnsi(output)
    expect(visibleOutput).toStartWith("\r✦ agent thinking.")
    expect(visibleOutput).not.toContain("\n\r✦ agent thinking.")
    expect(visibleOutput).not.toContain("- agent thinking")
  })

  test("cycles diamond thinking dots from one to three and clears the widest label", () => {
    jest.useFakeTimers()
    const chunks: string[] = []
    const view = new AgentTerminalView({
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    view.startSpinner("agent thinking")
    jest.advanceTimersByTime(120)
    jest.advanceTimersByTime(120)
    view.stopSpinner()

    const output = chunks.join("")
    const visibleOutput = stripAnsi(output)
    expect(visibleOutput).toContain("✦ agent thinking.")
    expect(visibleOutput).toContain("✧ agent thinking..")
    expect(visibleOutput).toContain("◆ agent thinking...")
    expect(output).toContain(`\r${" ".repeat("◆ agent thinking...".length)}\r`)
  })

  test("renders the highlighted use_emulator tool-call block with yellow guard rows", async () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      imageRenderer: {
        render: () => Promise.resolve("[agent image]"),
      },
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    chalk.level = 1
    view.startSpinner("loading agent")
    view.stopSpinner()
    await view.showObservation(observationFixture, 3)
    view.handleEvent({ type: "turn-start" })
    view.handleEvent({
      input: { buttons: ["up"] },
      toolCallId: "call-1",
      toolName: "use_emulator",
      type: "tool-call",
    })
    view.stopSpinner()

    const output = chunks.join("")
    const visibleOutput = stripAnsi(output)
    const expectedBlankLine = " ".repeat(80)
    const expectedToolLine = " Using tool: use_emulator - Buttons: ['up'] ".padEnd(80, " ")
    expect(visibleOutput).toContain("loading agent")
    expect(visibleOutput).toContain("\r✦ agent thinking.")
    expect(visibleOutput).toContain("[agent image]\n\n\r✦ agent thinking.")
    expect(visibleOutput).not.toContain("[agent image]\n\n\n\r✦ agent thinking.")
    expect(visibleOutput).not.toContain("- agent thinking")
    expect(visibleOutput).toContain("TURN 3")
    expect(visibleOutput).toContain("LOC Pallet Town tile 5,6 facing up exits up/left")
    expect(visibleOutput).toContain("STATE Squirtle Lv5 19/19 | field | no dialog")
    expect(visibleOutput).toContain("[agent image]")
    expect(visibleOutput).not.toContain("MODEL TEXT")
    expect(visibleOutput).toContain(
      `\n${expectedBlankLine}\n${expectedToolLine}\n${expectedBlankLine}\n\n`,
    )
    expect(output).toContain(
      [
        `\u001B[43m\u001B[30m${expectedBlankLine}\u001B[39m\u001B[49m`,
        `\u001B[43m\u001B[30m${expectedToolLine}\u001B[39m\u001B[49m`,
        `\u001B[43m\u001B[30m${expectedBlankLine}\u001B[39m\u001B[49m`,
        "",
      ].join("\n"),
    )
  })

  test("pads malformed use_emulator input fallback inside yellow guard rows", () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    view.handleEvent({
      input: { buttons: [] },
      toolCallId: "call-1",
      toolName: "use_emulator",
      type: "tool-call",
    })

    const expectedBlankLine = " ".repeat(80)
    const expectedToolLine = ' Using tool: use_emulator - Buttons: {"buttons":[]} '.padEnd(80, " ")
    expect(stripAnsi(chunks.join(""))).toContain(
      `\n${expectedBlankLine}\n${expectedToolLine}\n${expectedBlankLine}\n\n`,
    )
  })

  test("renders assistant text on a slightly lighter dark block without labels", () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    chalk.level = 1
    view.handleEvent({
      text: "After moving left:\nLOC Viridian City\n",
      type: "assistant-text",
    })

    const expectedBlankLine = " ".repeat(80)
    const expectedLine = "After moving left: LOC Viridian City".padEnd(80, " ")
    expect(stripAnsi(chunks.join(""))).toContain(
      ["", expectedBlankLine, expectedLine, expectedBlankLine, "", ""].join("\n"),
    )
    expect(chunks.join("")).toContain(
      [
        chalk.bgBlackBright.white(expectedBlankLine),
        chalk.bgBlackBright.white(expectedLine),
        chalk.bgBlackBright.white(expectedBlankLine),
        "",
      ].join("\n"),
    )
    expect(stripAnsi(chunks.join(""))).not.toContain("TEXT")
  })

  test("renders assistant reasoning on the original dark block without labels", () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    chalk.level = 1
    view.handleEvent({
      text: "press a to advance dialog\n",
      type: "assistant-reasoning",
    })

    const expectedBlankLine = " ".repeat(80)
    const expectedReasoningLine = "press a to advance dialog".padEnd(80, " ")
    expect(stripAnsi(chunks.join(""))).toContain(
      ["", expectedBlankLine, expectedReasoningLine, expectedBlankLine, "", ""].join("\n"),
    )
    expect(chunks.join("")).toContain(chalk.bgBlack.white(expectedReasoningLine))
    expect(stripAnsi(chunks.join(""))).not.toContain("REASONING")
  })

  test("renders only a line break after a human action observation", async () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      imageRenderer: {
        render: () => Promise.resolve("[updated image]"),
      },
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    await view.showActionObservation(observationFixture, 4)

    const output = chunks.join("")
    expect(output).toBe("\n")
    expect(output).not.toContain("AFTER ACTION")
    expect(output).not.toContain("[updated image]")
    expect(output).not.toContain("Pallet Town")
  })

  test("renders one screen image per turn across an action cycle", async () => {
    let renderCalls = 0
    const view = new AgentTerminalView({
      imageRenderer: {
        render: () => {
          renderCalls += 1
          return Promise.resolve("[agent image]")
        },
      },
      writer: {
        write: () => {},
      },
    })

    await view.showObservation(observationFixture, 1)
    await view.showActionObservation(observationFixture, 1)
    await view.showObservation(observationFixture, 2)

    expect(renderCalls).toBe(2)
  })

  test("renders live grid screens 1.5x larger while preserving screenshot/grid ratio", async () => {
    const gridOptions: unknown[] = []
    const screenshotOnlyOptions: unknown[] = []
    const { gridScreenshot: _gridScreenshot, ...screenshotOnlyObservation } = observationFixture

    await withStdoutRows(24, async () => {
      const gridView = new AgentTerminalView({
        imageRenderer: {
          render: (_payload, options) => {
            gridOptions.push(options)
            return Promise.resolve("[grid image]")
          },
        },
        writer: { write: () => {} },
      })
      const screenshotOnlyView = new AgentTerminalView({
        imageRenderer: {
          render: (_payload, options) => {
            screenshotOnlyOptions.push(options)
            return Promise.resolve("[screen image]")
          },
        },
        writer: { write: () => {} },
      })

      await gridView.showObservation(observationFixture, 1)
      await screenshotOnlyView.showObservation(screenshotOnlyObservation, 1)
    })

    expect(gridOptions).toEqual([{ height: 5, preserveAspectRatio: true }])
    expect(screenshotOnlyOptions).toEqual([{ height: 9, preserveAspectRatio: true }])
  })

  test("adds a blank line after the live screen image", async () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      imageRenderer: {
        render: () => Promise.resolve("[agent image]"),
      },
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    await view.showObservation(observationFixture, 1)

    expect(chunks.join("")).toEndWith("[agent image]\n\n")
  })

  test("keeps agent reasoning and emulator buttons visible after the next screen redraw", async () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      imageRenderer: {
        render: () => Promise.resolve("[agent image]"),
      },
      redrawFrames: true,
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    await view.showObservation(observationFixture, 1)
    view.handleEvent({
      text: "<thinking>press a to advance dialog</thinking>\n",
      type: "assistant-reasoning",
    })
    view.handleEvent({
      input: { buttons: ["a"] },
      toolCallId: "call-1",
      toolName: "use_emulator",
      type: "tool-call",
    })
    await view.showActionObservation(observationFixture, 1)
    await view.showObservation(observationFixture, 2)

    const replayedScreen = stripAnsi(chunks.slice(lastClearIndex(chunks) + 1).join(""))
    expect(replayedScreen).toContain("<thinking>press a to advance dialog</thinking>")
    expect(replayedScreen).toContain("Using tool: use_emulator - Buttons: ['a']")
    expect(replayedScreen).not.toContain("AFTER ACTION")
    expect(replayedScreen.indexOf("Using tool: use_emulator")).toBeLessThan(
      replayedScreen.indexOf("[agent image]"),
    )
  })

  test("does not dump tool result JSON into the live terminal view", () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    view.handleEvent({
      output: { ok: true, verification: { summary: "frame advanced" } },
      toolCallId: "call-1",
      toolName: "use_emulator",
      type: "tool-result",
    })
    view.stopSpinner()

    const output = stripAnsi(chunks.join(""))
    expect(output).toContain("loading next screen")
    expect(output).not.toContain("DONE")
    expect(output).not.toContain("verification")
  })

  test("redraws the live observation frame instead of appending the next screen", async () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      imageRenderer: {
        render: () => Promise.resolve("[agent image]"),
      },
      redrawFrames: true,
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    await view.showObservation(observationFixture, 1)
    await view.showActionObservation(
      {
        ...observationFixture,
        state: {
          ...observationFixture.state,
          collision: {
            ...observationFixture.state.collision,
            ascii: "A B C\n1 . @ #\n2 . . .\n3 # # .\n@ you",
          },
        },
      },
      1,
    )
    await view.showObservation(observationFixture, 2)

    const output = chunks.join("")
    const clearChunk = chunks.find((chunk) => chunk.startsWith("\u001B["))
    expect(output).toContain("TURN")
    expect(output).not.toContain("AFTER ACTION")
    expect(clearChunk).toEndWith("A\u001B[J")
    expect(Number.parseInt(clearChunk?.slice(2) ?? "", 10)).toBeGreaterThan(0)
  })

  test("includes transient agent status rows when redrawing the next screen", async () => {
    const baselineRows = await firstClearRowCount({ includeTransientRows: false })
    const transientRows = await firstClearRowCount({ includeTransientRows: true })

    expect(transientRows).toBeGreaterThan(baselineRows)
  })
})

async function firstClearRowCount({
  includeTransientRows,
}: {
  readonly includeTransientRows: boolean
}): Promise<number> {
  const chunks: string[] = []
  const view = new AgentTerminalView({
    imageRenderer: {
      render: () => Promise.resolve("[agent image]"),
    },
    redrawFrames: true,
    writer: {
      write: (chunk) => {
        chunks.push(chunk)
      },
    },
  })

  await view.showObservation(observationFixture, 1)
  if (includeTransientRows) {
    view.handleEvent({ type: "turn-start" })
    view.handleEvent({
      input: { buttons: ["up"] },
      toolCallId: "call-1",
      toolName: "use_emulator",
      type: "tool-call",
    })
  }
  await view.showActionObservation(observationFixture, 1)
  await view.showObservation(observationFixture, 2)

  const clearChunk = chunks.find((chunk) => chunk.startsWith("\u001B["))
  return Number.parseInt(clearChunk?.slice(2) ?? "", 10)
}

function stripAnsi(value: string): string {
  const ansiSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g")
  return value.replace(ansiSequence, "")
}

function lastClearIndex(chunks: readonly string[]): number {
  return chunks.findLastIndex((chunk) => chunk.startsWith("\u001B["))
}

async function withStdoutRows<T>(rows: number, callback: () => Promise<T>): Promise<T> {
  const previousRows = process.stdout.rows
  Object.defineProperty(process.stdout, "rows", {
    configurable: true,
    value: rows,
  })
  try {
    return await callback()
  } finally {
    Object.defineProperty(process.stdout, "rows", {
      configurable: true,
      value: previousRows,
    })
  }
}
