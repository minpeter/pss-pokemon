import chalk from "chalk"
import { z } from "zod"
import { formatTerminalHighlightBlock } from "./terminal-highlight-block"

const EmulatorButtonSchema = z.enum([
  "a",
  "b",
  "up",
  "down",
  "left",
  "right",
  "start",
  "select",
  "wait",
])
const UseEmulatorToolInputSchema = z.object({
  buttons: z.array(EmulatorButtonSchema).min(1).max(32),
})

export function formatToolCall(
  toolName: string,
  input: unknown,
  { prefixNewline }: { readonly prefixNewline: boolean },
): string {
  const prefix = prefixNewline ? "\n" : ""
  if (toolName !== "use_emulator") {
    return `${prefix}${chalk.yellow("ACTION")} ${toolName} ${JSON.stringify(input)}\n`
  }

  const label = ` Using tool: use_emulator - Buttons: ${formatUseEmulatorButtons(input)} `
  return formatTerminalHighlightBlock({
    colorize: chalk.bgYellow.black,
    lines: [label],
    prefixNewline,
  })
}

function formatUseEmulatorButtons(input: unknown): string {
  const parsed = UseEmulatorToolInputSchema.safeParse(input)
  if (!parsed.success) {
    return JSON.stringify(input) ?? "unknown"
  }
  return `[${parsed.data.buttons.map((button) => `'${button}'`).join(", ")}]`
}
