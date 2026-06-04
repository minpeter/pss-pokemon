import { describe, expect, test } from "bun:test"
import { AgentTerminalView } from "./agent-terminal-view"
import { observationFixture } from "./agent-test-fixtures"

const NATIVE_IMAGE = "\u001B_Gnative-image\u001B\\"

describe("AgentTerminalView native image scrollback", () => {
  test("keeps native-image turns in scrollback with their text instead of clearing text only", async () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      imageRenderer: {
        render: () => Promise.resolve(NATIVE_IMAGE),
      },
      redrawFrames: true,
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    await view.showObservation(observationFixture, 1)
    view.handleEvent({ type: "turn-start" })
    view.handleEvent({
      input: { buttons: ["up"] },
      toolCallId: "call-1",
      toolName: "use_emulator",
      type: "tool-call",
    })
    await view.showActionObservation(observationFixture, 1)
    await view.showObservation(observationFixture, 2)

    const output = chunks.join("")
    const visibleOutput = stripAnsi(output)
    expect(output).not.toContain("\u001B[J")
    expect(visibleOutput).toContain("TURN 1")
    expect(visibleOutput).toContain("TURN 2")
    expect(visibleOutput).toContain("Using tool: use_emulator - Buttons: ['up']")
    expect(output.split(NATIVE_IMAGE)).toHaveLength(3)
  })

  test("does not replay the same tool call inside the next native-image frame", async () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      imageRenderer: {
        render: () => Promise.resolve(NATIVE_IMAGE),
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
      text: "After moving left:\n",
      type: "assistant-text",
    })
    view.handleEvent({
      input: { buttons: ["down"] },
      toolCallId: "call-1",
      toolName: "use_emulator",
      type: "tool-call",
    })
    await view.showActionObservation(observationFixture, 1)
    await view.showObservation(observationFixture, 2)

    const visibleOutput = stripAnsi(chunks.join(""))
    expect(visibleOutput.match(/After moving left:/g)).toHaveLength(1)
    expect(visibleOutput.match(/Using tool: use_emulator/g)).toHaveLength(1)
  })

  test("renders the bordered tool-call block before the next native-image turn", async () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      imageRenderer: {
        render: () => Promise.resolve(NATIVE_IMAGE),
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
      text: "After moving left:\n",
      type: "assistant-text",
    })
    view.handleEvent({
      input: { buttons: ["down"] },
      toolCallId: "call-1",
      toolName: "use_emulator",
      type: "tool-call",
    })
    await view.showActionObservation(observationFixture, 1)
    await view.showObservation(observationFixture, 2)

    const visibleOutput = stripAnsi(chunks.join(""))
    const expectedBlankLine = " ".repeat(80)
    const expectedAgentLine = "After moving left:".padEnd(80, " ")
    const expectedToolLine = " Using tool: use_emulator - Buttons: ['down'] ".padEnd(80, " ")
    expect(visibleOutput).toContain(
      [
        expectedBlankLine,
        expectedAgentLine,
        expectedBlankLine,
        "",
        "",
        expectedBlankLine,
        expectedToolLine,
        expectedBlankLine,
        "",
        "TURN 2",
      ].join("\n"),
    )
  })

  test("keeps a visible blank line above the tool-call block after an open spinner row", async () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      imageRenderer: {
        render: () => Promise.resolve(NATIVE_IMAGE),
      },
      redrawFrames: true,
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    await view.showObservation(observationFixture, 1)
    view.handleEvent({ type: "turn-start" })
    view.handleEvent({
      input: { buttons: ["down"] },
      toolCallId: "call-1",
      toolName: "use_emulator",
      type: "tool-call",
    })

    const visibleOutput = stripAnsi(chunks.join(""))
    const expectedBlankLine = " ".repeat(80)
    const expectedToolLine = " Using tool: use_emulator - Buttons: ['down'] ".padEnd(80, " ")
    expect(visibleOutput).toContain(`\r\n\n${expectedBlankLine}\n${expectedToolLine}`)
  })

  test("does not insert an extra newline before agent thinking after a native-image frame", async () => {
    const chunks: string[] = []
    const view = new AgentTerminalView({
      imageRenderer: {
        render: () => Promise.resolve(NATIVE_IMAGE),
      },
      redrawFrames: true,
      writer: {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
    })

    await view.showObservation(observationFixture, 1)
    view.handleEvent({ type: "turn-start" })

    const output = chunks.join("")
    expect(output).toContain(`${NATIVE_IMAGE}\n\r`)
    expect(output).not.toContain(`${NATIVE_IMAGE}\n\n\r`)
  })
})

function stripAnsi(value: string): string {
  const ansiSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g")
  return value.replace(ansiSequence, "")
}
