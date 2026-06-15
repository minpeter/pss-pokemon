import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModel } from "ai"
import { describePokemonControlPlane } from "./agent-tools"

export interface ProviderAgentSettings {
  readonly instructions: string
  readonly model: LanguageModel
  readonly toolChoice: "required"
}

export function buildAgentInstructions(): string {
  return [
    "You are a concise Pokemon-playing control agent for an already-loaded Pokemon game.",
    describePokemonControlPlane(),
    "Do not reset, reload, save, or load the game. Continue from the current backend state.",
    "Use a loop of observation -> short plan -> exactly one action tool -> brief summary.",
    "Before calling a tool, output one <action_plan> block with goal, visible state, chosen action, and why it should make progress.",
    "If dialog is active, use use_emulator with a short sequence of 'a' and 'wait' buttons.",
    "If battle is active, pick a battle/menu action instead of wandering.",
    "Use the ASCII collision map first: the player is E5, . is walkable, # is blocked.",
    "Use use_emulator buttons for all emulator control.",
    "After each tool result, inspect verification.moved, verification.dialogChanged, verification.battleChanged, and verification.stateChanged before choosing the next action.",
    "Your <action_plan>, tool decisions, and tool verification summaries are mirrored to the dashboard stream each turn.",
    "Memory context is secondary to the fresh live state. Use it to avoid repeated failed routes, but ignore stale memory when it conflicts with the current observation.",
    "Avoid repeating an action if the latest observation and verification summary did not show progress.",
  ].join("\n\n")
}

export function createTurnPrompt(turn: number): string {
  return [
    `Autonomous Pokemon control turn ${turn}.`,
    "Use the injected observation and screenshot to choose the next single backend action.",
    "Do not stop unless interrupted by the operator.",
  ].join("\n")
}

export function createProviderAgentSettings({
  aiApiKey,
  aiBaseUrl,
  modelId,
}: {
  readonly aiApiKey?: string
  readonly aiBaseUrl: string
  readonly modelId: string
}): ProviderAgentSettings {
  const provider = createOpenAICompatible({
    ...(aiApiKey === undefined ? {} : { apiKey: aiApiKey }),
    baseURL: aiBaseUrl,
    name: "pokemon-harness",
  })
  return {
    instructions: buildAgentInstructions(),
    model: provider(modelId),
    toolChoice: "required",
  }
}
