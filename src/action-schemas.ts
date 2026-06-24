import { z } from "zod"

const DEFAULT_CONTROLLER_ID = "agent-cli"
const MAX_SUPERVISED_FRAMES = 600

export const ButtonSchema = z.enum(["up", "down", "left", "right", "a", "b", "start", "select"])
export const DirectionSchema = z.enum(["up", "down", "left", "right"])

export const ButtonStepSchema = z.object({
  type: z.literal("button"),
  button: ButtonSchema,
  pressFrames: z.number().int().min(1).optional(),
  waitFrames: z.number().int().min(0).optional(),
})

export const WaitStepSchema = z.object({
  type: z.literal("wait"),
  frames: z.number().int().min(1).max(MAX_SUPERVISED_FRAMES),
})

export const WalkStepSchema = z.object({
  type: z.literal("walk"),
  direction: DirectionSchema,
  pressFrames: z.number().int().min(1).max(60).optional(),
  waitFrames: z.number().int().min(0).max(600).optional(),
})

export const HoldStepSchema = z.object({
  type: z.literal("hold"),
  button: ButtonSchema,
  frames: z.number().int().min(1).max(600),
})

export const TextSkipUntilDialogEndStepSchema = z.object({
  type: z.literal("text_skip_until_dialog_end"),
  button: z.literal("a").default("a"),
  pressFrames: z.number().int().min(1).optional(),
  waitFrames: z.number().int().min(0).optional(),
  maxPresses: z.number().int().min(1).max(32).optional(),
})

export const ActionStepSchema = z.discriminatedUnion("type", [
  ButtonStepSchema,
  WaitStepSchema,
  WalkStepSchema,
  HoldStepSchema,
  TextSkipUntilDialogEndStepSchema,
])

type ParsedActionStep = z.infer<typeof ActionStepSchema>

const TypedActionRequestSchema = z.object({
  controllerId: z.string().min(1).default(DEFAULT_CONTROLLER_ID),
  sequence: z.array(ActionStepSchema).min(1).max(32),
})

const NousActionTokenSchema = z
  .string()
  .refine((token) => parseNousActionToken(token) !== null, {
    message: "unsupported action token",
  })
  .transform((token) => {
    const step = parseNousActionToken(token)
    if (step === null) {
      throw new UnsupportedActionTokenError(token)
    }
    return step
  })

const NousActionRequestSchema = z
  .object({
    actions: z.array(NousActionTokenSchema).min(1).max(32),
    controllerId: z.string().min(1).default(DEFAULT_CONTROLLER_ID),
  })
  .transform(({ actions, controllerId }) => ({ controllerId, sequence: actions }))

export const ActionRequestSchema = z.union([TypedActionRequestSchema, NousActionRequestSchema])

export type ActionRequest = z.infer<typeof ActionRequestSchema>
export type Direction = z.infer<typeof DirectionSchema>

function parseNousActionToken(token: string): ParsedActionStep | null {
  if (token === "a_until_dialog_end") {
    return { button: "a", type: "text_skip_until_dialog_end" }
  }

  if (token.startsWith("press_")) {
    const button = ButtonSchema.safeParse(token.slice("press_".length))
    return button.success ? { button: button.data, type: "button" } : null
  }

  if (token.startsWith("walk_")) {
    const direction = DirectionSchema.safeParse(token.slice("walk_".length))
    return direction.success ? { direction: direction.data, type: "walk" } : null
  }

  if (token.startsWith("wait_")) {
    const frames = parseFrameToken(token.slice("wait_".length))
    return frames === null ? null : { frames, type: "wait" }
  }

  if (token.startsWith("hold_")) {
    return parseHoldToken(token)
  }

  return null
}

function parseHoldToken(token: string): ParsedActionStep | null {
  const body = token.slice("hold_".length)
  const separatorIndex = body.lastIndexOf("_")
  if (separatorIndex <= 0 || separatorIndex === body.length - 1) {
    return null
  }

  const button = ButtonSchema.safeParse(body.slice(0, separatorIndex))
  const frames = parseFrameToken(body.slice(separatorIndex + 1))
  if (!button.success || frames === null) {
    return null
  }

  return { button: button.data, frames, type: "hold" }
}

function parseFrameToken(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) {
    return null
  }

  const frames = Number.parseInt(value, 10)
  return frames >= 1 && frames <= MAX_SUPERVISED_FRAMES ? frames : null
}

class UnsupportedActionTokenError extends Error {
  constructor(readonly token: string) {
    super(`unsupported action token: ${token}`)
    this.name = "UnsupportedActionTokenError"
  }
}
