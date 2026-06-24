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
  const columns = Math.max(1, process.stdout.columns ?? HIGHLIGHT_LINE_FALLBACK_COLUMNS)
  const wrappedContentLines = contentLines.flatMap((line) => wrapTerminalLine(line, columns))
  const blankLine = " ".repeat(columns)
  const highlightedLines = [
    blankLine,
    ...wrappedContentLines.map((line) => line.padEnd(columns, " ")),
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

function wrapTerminalLine(line: string, columns: number): readonly string[] {
  if (line.length <= columns) {
    return [line]
  }

  const words = line.split(/\s+/u).filter((word) => word.length > 0)
  if (words.length === 0) {
    return [""]
  }

  const wrappedLines: string[] = []
  let currentLine = ""
  for (const word of words) {
    if (word.length > columns) {
      if (currentLine.length > 0) {
        wrappedLines.push(currentLine)
        currentLine = ""
      }
      wrappedLines.push(...splitLongWord(word, columns))
      continue
    }

    const candidate = currentLine.length === 0 ? word : `${currentLine} ${word}`
    if (candidate.length <= columns) {
      currentLine = candidate
      continue
    }

    wrappedLines.push(currentLine)
    currentLine = word
  }

  if (currentLine.length > 0) {
    wrappedLines.push(currentLine)
  }
  return wrappedLines
}

function splitLongWord(word: string, columns: number): readonly string[] {
  const chunks: string[] = []
  for (let index = 0; index < word.length; index += columns) {
    chunks.push(word.slice(index, index + columns))
  }
  return chunks
}
