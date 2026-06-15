import type { AgentEvent } from "@minpeter/pss-runtime"
import { z } from "zod"
import type { PokemonApiClient } from "./api-client"

const ToolVerificationOutputSchema = z.object({
  verification: z.object({
    summary: z.string(),
  }),
})

export function createDashboardEventForwarder(
  client: PokemonApiClient,
  onEvent: (event: AgentEvent) => void | Promise<void>,
): (event: AgentEvent) => Promise<void> {
  return async (event) => {
    await onEvent(event)
    await postDashboardEventForAgentEvent(client, event)
  }
}

async function postDashboardEventForAgentEvent(
  client: PokemonApiClient,
  event: AgentEvent,
): Promise<void> {
  switch (event.type) {
    case "assistant-reasoning":
      await client.postEvent({ text: event.text, type: "reasoning" })
      return
    case "assistant-text":
      if (event.text.includes("<action_plan>")) {
        await client.postEvent({ text: event.text, type: "reasoning" })
      }
      return
    case "tool-call":
      await client.postEvent({
        text: `${event.toolName} ${JSON.stringify(event.input)}`,
        type: "decision",
      })
      return
    case "tool-result":
      await client.postEvent({
        text: `${event.toolName}: ${formatToolResultSummary(event.output)}`,
        type: "action",
      })
      return
    case "runtime-input":
    case "step-end":
    case "step-start":
    case "turn-abort":
    case "turn-end":
    case "turn-error":
    case "turn-start":
    case "user-message":
    case "user-text":
      return
    default:
      assertNever(event)
  }
}

function formatToolResultSummary(output: unknown): string {
  const parsed = ToolVerificationOutputSchema.safeParse(output)
  if (parsed.success) {
    return parsed.data.verification.summary
  }

  return JSON.stringify(output) ?? "completed"
}

function assertNever(value: never): never {
  throw new UnhandledDashboardEventError(value)
}

class UnhandledDashboardEventError extends Error {
  constructor(readonly value: never) {
    super(`unhandled dashboard event: ${JSON.stringify(value)}`)
    this.name = "UnhandledDashboardEventError"
  }
}
