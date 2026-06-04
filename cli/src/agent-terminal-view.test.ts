import { afterEach, describe, expect, jest, test } from "bun:test"
import { AgentTerminalView } from "./agent-terminal-view"
import { observationFixture } from "./agent-test-fixtures"

describe("AgentTerminalView", () => {
  afterEach(() => {
    if (jest.isFakeTimers()) {
      jest.clearAllTimers()
    }
    jest.useRealTimers()
  })

  test("renders agent thinking with a leading blank line, diamond, and one dot", () => {
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
    expect(visibleOutput).toContain("\n\r✦ agent thinking.")
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

  test("preserves observation and action output while using separated diamond thinking dots", async () => {
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
    expect(visibleOutput).toContain("loading agent")
    expect(visibleOutput).toContain("\n\r✦ agent thinking.")
    expect(visibleOutput).not.toContain("- agent thinking")
    expect(visibleOutput).toContain("TURN")
    expect(visibleOutput).toContain("3")
    expect(visibleOutput).toContain("Fresh Pokemon harness observation before turn 3.")
    expect(visibleOutput).toContain("[agent image]")
    expect(visibleOutput).toContain("Pallet Town")
    expect(visibleOutput).toContain("ACTION use_emulator")
  })

  test("renders compact action status without another image after an action", async () => {
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
    expect(output).toContain("AFTER ACTION")
    expect(output).toContain("4")
    expect(output).toContain("frame 26")
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
    expect(output).toContain("AFTER ACTION")
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
