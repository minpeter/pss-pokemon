import { describe, expect, test } from "bun:test"
import { observationFixture } from "./agent-test-fixtures"
import { writeLiveTerminalFrame } from "./live-terminal-frame"

describe("writeLiveTerminalFrame", () => {
  test("renders the turn and agent-injected text before the screen image", async () => {
    const chunks: string[] = []
    const renderedPayloads: Uint8Array[] = []

    await writeLiveTerminalFrame(
      observationFixture,
      {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
      {
        render: (payload) => {
          renderedPayloads.push(payload)
          return Promise.resolve("[live image]")
        },
      },
      {
        header: "TURN 62",
        modelInputText: "Fresh Pokemon harness observation before turn 62.",
        transcript: "Using tool: use_emulator - Buttons: ['up']",
      },
    )

    const visibleOutput = stripAnsi(chunks.join(""))
    expect(renderedPayloads).toHaveLength(1)
    expect(visibleOutput).toContain("TURN 62")
    expect(visibleOutput).toContain("Using tool: use_emulator - Buttons: ['up']")
    expect(visibleOutput).toContain("AGENT INPUT")
    expect(visibleOutput).toContain("Fresh Pokemon harness observation before turn 62.")
    expect(visibleOutput).toContain("Observation summary:")
    expect(visibleOutput).toContain("LOC Pallet Town tile 5,6 facing up exits up/left")
    expect(visibleOutput).toContain("COLLISION")
    expect(visibleOutput).toContain("Image 1: current game screenshot.")
    expect(visibleOutput).not.toContain("MODEL TEXT")
    expect(visibleOutput.indexOf("TURN 62")).toBeLessThan(visibleOutput.indexOf("[live image]"))
    expect(visibleOutput.indexOf("Using tool: use_emulator")).toBeLessThan(
      visibleOutput.indexOf("[live image]"),
    )
    expect(visibleOutput.indexOf("AGENT INPUT")).toBeLessThan(
      visibleOutput.indexOf("SCREEN + GRID"),
    )
    expect(visibleOutput.indexOf("SCREEN + GRID")).toBeLessThan(
      visibleOutput.indexOf("[live image]"),
    )
  })

  test("does not reserve extra rows after Kitty graphics because Ghostty advances the cursor", async () => {
    const chunks: string[] = []
    const kittyImage = "\u001B_Gnative-image\u001B\\"

    await writeLiveTerminalFrame(
      observationFixture,
      {
        write: (chunk) => {
          chunks.push(chunk)
        },
      },
      {
        render: () => Promise.resolve(kittyImage),
      },
      {
        header: "TURN 63",
      },
    )

    const output = chunks.join("")
    expect(output).toContain(`${kittyImage}\n`)
    expect(output).not.toContain(`${kittyImage}\n\n`)
    expect(output).not.toContain(`${kittyImage}\r\n`)
  })
})

function stripAnsi(value: string): string {
  const ansiSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g")
  return value.replace(ansiSequence, "")
}
