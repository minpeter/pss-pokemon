import { z } from "zod"
import type { AgentObservation } from "./agent-observation-types"
import type { PokemonActionExecution } from "./pokemon-action-executor"
import { PositionSchema } from "./schemas"

export type MovementDirection = "down" | "left" | "right" | "up"

export interface TilePosition {
  readonly x: number
  readonly y: number
}

export interface MovementAttemptMemory {
  readonly direction: MovementDirection
  readonly failures: number
  readonly lastFrame: number
  readonly mapId: number | null
  readonly mapName: string
  readonly tile: TilePosition
}

export interface ProgressFactMemory {
  readonly fact: string
  readonly frame: number
  readonly turn: number
}

export interface RecentActionMemory {
  readonly action: string
  readonly frame: number
  readonly turn: number
}

export interface UntrustedDialogMemory {
  readonly frame: number
  readonly text: string
  readonly turn: number
}

export interface PokemonMemoryProjection {
  readonly invalidatedAssumptions: readonly string[]
  readonly movementAttempts: readonly MovementAttemptMemory[]
  readonly progressFacts: readonly ProgressFactMemory[]
  readonly recentActions: readonly RecentActionMemory[]
  readonly untrustedDialogFacts: readonly UntrustedDialogMemory[]
}

export type PokemonMemoryProjectionInput = Omit<
  PokemonMemoryProjection,
  "progressFacts" | "untrustedDialogFacts"
> &
  Partial<Pick<PokemonMemoryProjection, "progressFacts" | "untrustedDialogFacts">>

export interface PokemonAgentMemory {
  readonly projection: PokemonMemoryProjection
  recordAction(execution: PokemonActionExecution, turn: number): Promise<void>
  renderContext(observation: AgentObservation): string
}

export interface PokemonAgentMemoryRecord {
  readonly execution: PokemonActionExecution
  readonly projection: PokemonMemoryProjection
  readonly turn: number
}

export type PokemonAgentMemoryRecorder = (record: PokemonAgentMemoryRecord) => Promise<void> | void

export const PokemonMemoryProjectionSchema: z.ZodType<PokemonMemoryProjection> = z.object({
  invalidatedAssumptions: z.array(z.string()),
  movementAttempts: z.array(
    z.object({
      direction: z.enum(["down", "left", "right", "up"]),
      failures: z.number().int().min(1),
      lastFrame: z.number().int().min(0),
      mapId: z.number().int().nullable(),
      mapName: z.string(),
      tile: PositionSchema,
    }),
  ),
  recentActions: z.array(
    z.object({
      action: z.string().min(1),
      frame: z.number().int().min(0),
      turn: z.number().int().min(1),
    }),
  ),
  progressFacts: z
    .array(
      z.object({
        fact: z.string().min(1),
        frame: z.number().int().min(0),
        turn: z.number().int().min(1),
      }),
    )
    .default([]),
  untrustedDialogFacts: z
    .array(
      z.object({
        frame: z.number().int().min(0),
        text: z.string().min(1),
        turn: z.number().int().min(1),
      }),
    )
    .default([]),
})

export const EMPTY_MEMORY_PROJECTION: PokemonMemoryProjection = {
  invalidatedAssumptions: [],
  movementAttempts: [],
  progressFacts: [],
  recentActions: [],
  untrustedDialogFacts: [],
}
