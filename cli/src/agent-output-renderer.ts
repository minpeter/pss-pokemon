import chalk from "chalk"
import { compactTerminalTextLines, formatTerminalHighlightBlock } from "./terminal-highlight-block"

type AgentOutputKind = "reasoning" | "text"

const AgentOutputColorizers: Record<AgentOutputKind, (line: string) => string> = {
  reasoning: chalk.bgBlack.white,
  text: chalk.bgBlackBright.white,
}

export function formatAgentOutput(
  text: string,
  { kind, prefixNewline }: { readonly kind: AgentOutputKind; readonly prefixNewline: boolean },
): string {
  return formatTerminalHighlightBlock({
    colorize: AgentOutputColorizers[kind],
    lines: compactTerminalTextLines(text),
    prefixNewline,
  })
}
