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
    expect(output).toContain("\n\r✦ agent thinking.")
    expect(output).not.toContain("- agent thinking")
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
    expect(output).toContain("✦ agent thinking.")
    expect(output).toContain("✧ agent thinking..")
    expect(output).toContain("◆ agent thinking...")
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
    expect(output).toContain("loading agent")
    expect(output).toContain("\n\r✦ agent thinking.")
    expect(output).not.toContain("- agent thinking")
    expect(output).toContain("TURN")
    expect(output).toContain("3")
    expect(output).toContain("Fresh Pokemon harness observation before turn 3.")
    expect(output).toContain("[agent image]")
    expect(output).toContain("Pallet Town")
    expect(output).toContain("ACTION use_emulator")
  })

  test("renders the updated screen after an action", async () => {
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
    expect(output).toContain("[updated image]")
    expect(output).toContain("Pallet Town")
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

    const output = chunks.join("")
    const clearChunk = chunks.find((chunk) => chunk.startsWith("\u001B["))
    expect(output).toContain("TURN")
    expect(output).toContain("AFTER ACTION")
    expect(clearChunk).toEndWith("A\u001B[J")
    expect(Number.parseInt(clearChunk?.slice(2) ?? "", 10)).toBeGreaterThan(0)
  })
})
