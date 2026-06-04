const HIGHLIGHT_LINE_FALLBACK_COLUMNS = 80

export interface TerminalHighlightBlockOptions {
  readonly colorize: (line: string) => string
  readonly lines: readonly string[]
  readonly prefixNewline: boolean
}

export function formatTerminalHighlightBlock({
  colorize,
  lines,
  prefixNewline,
}: TerminalHighlightBlockOptions): string {
  const contentLines = lines.length > 0 ? lines : [""]
  const columns = Math.max(
    process.stdout.columns ?? HIGHLIGHT_LINE_FALLBACK_COLUMNS,
    ...contentLines.map((line) => line.length),
  )
  const blankLine = " ".repeat(columns)
  const highlightedLines = [
    blankLine,
    ...contentLines.map((line) => line.padEnd(columns, " ")),
    blankLine,
  ].map((line) => colorize(line))
  const leadingBlankLine = prefixNewline ? "\n\n" : "\n"
  return `${leadingBlankLine}${highlightedLines.join("\n")}\n\n`
}

export function compactTerminalTextLines(text: string): readonly string[] {
  const compactedText = text.replace(/\s*\n+\s*/gu, " ").trim()
  if (compactedText.length === 0) {
    return [""]
  }
  return [compactedText]
}
