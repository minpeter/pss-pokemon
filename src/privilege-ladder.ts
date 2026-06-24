import { z } from "zod"
import { RED_BLUE_OBJECTIVES, type RedBlueObjectiveId } from "./objective-registry"

export const PrivilegeLevelSchema = z.enum([
  "pixels_only",
  "pixels_text",
  "ram_lite",
  "ram_full",
  "external_guidebook",
])

export const ControllerModeSchema = z.enum([
  "llm_buttons",
  "llm_macro_deterministic_micro",
  "deterministic_only",
])

export const SelfImprovementModeSchema = z.enum(["none", "proposal_only", "qa_gated"])

export const BackendKindSchema = z.enum(["pyboy_fake", "pyboy_real", "mgba_http", "pokeagent"])
export const RomIdentitySchema = z.union([
  z
    .object({
      kind: z.literal("unknown"),
      reason: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("known"),
      game: z.enum(["red", "blue", "emerald"]),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
])

const objectiveIds = RED_BLUE_OBJECTIVES.map((objective) => objective.objectiveId) as [
  RedBlueObjectiveId,
  ...RedBlueObjectiveId[],
]

export const RedBlueObjectiveIdSchema = z.enum(objectiveIds)

export const HarnessRunMetadataSchema = z
  .object({
    backendKind: BackendKindSchema,
    controllerMode: ControllerModeSchema,
    objectiveId: RedBlueObjectiveIdSchema,
    privilegeLevel: PrivilegeLevelSchema,
    romIdentity: RomIdentitySchema,
    selfImprovementMode: SelfImprovementModeSchema,
    temperature: z.number().min(0).max(2),
    type: z.literal("harness_run_metadata"),
    model: z
      .object({
        id: z.string().min(1),
        provider: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict()

export type PrivilegeLevel = z.infer<typeof PrivilegeLevelSchema>
export type ControllerMode = z.infer<typeof ControllerModeSchema>
export type SelfImprovementMode = z.infer<typeof SelfImprovementModeSchema>
export type BackendKind = z.infer<typeof BackendKindSchema>
export type RomIdentity = z.infer<typeof RomIdentitySchema>
export type HarnessRunMetadata = z.infer<typeof HarnessRunMetadataSchema>

export function parseHarnessRunMetadata(input: unknown): HarnessRunMetadata {
  return HarnessRunMetadataSchema.parse(input)
}

export function createUnknownRomIdentity(reason: string): RomIdentity {
  return RomIdentitySchema.parse({ kind: "unknown", reason })
}
