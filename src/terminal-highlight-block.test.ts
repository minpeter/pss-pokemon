import { describe, expect, test } from "bun:test"
import { formatTerminalHighlightBlock } from "./terminal-highlight-block"

describe("formatTerminalHighlightBlock", () => {
  test("wraps long content to terminal columns with one guard row above and below", () => {
    const output = withStdoutColumns(16, () =>
      formatTerminalHighlightBlock({
        colorize: (line) => line,
        lines: ["one two three four five"],
        prefixNewline: false,
      }),
    )

    const blankLine = " ".repeat(16)
    expect(output).toBe(`\n${blankLine}\none two three   \nfour five       \n${blankLine}\n\n`)
  })
})

function withStdoutColumns<T>(columns: number, callback: () => T): T {
  const previousColumns = process.stdout.columns
  Object.defineProperty(process.stdout, "columns", {
    configurable: true,
    value: columns,
  })
  try {
    return callback()
  } finally {
    Object.defineProperty(process.stdout, "columns", {
      configurable: true,
      value: previousColumns,
    })
  }
}
