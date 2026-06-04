import { z } from "zod"

export const ButtonSchema = z.enum(["up", "down", "left", "right", "a", "b", "start", "select"])
export const DirectionSchema = z.enum(["up", "down", "left", "right"])
const DEFAULT_CONTROLLER_ID = "agent-cli"

export const ButtonStepSchema = z.object({
  type: z.literal("button"),
  button: ButtonSchema,
  pressFrames: z.number().int().min(1).optional(),
  waitFrames: z.number().int().min(0).optional(),
})

export const WaitStepSchema = z.object({
  type: z.literal("wait"),
  frames: z.number().int().min(1),
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

export const PositionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
})

const PartyStatsSchema = z.object({
  attack: z.number().int(),
  defense: z.number().int(),
  speed: z.number().int(),
  special: z.number().int(),
})

const BattleEnemySchema = z.object({
  species: z.string().nullable(),
  level: z.number().int().nullable(),
  hp: z.number().int().nullable(),
  maxHp: z.number().int().nullable(),
  status: z.string().nullable(),
  moves: z.array(z.string()).optional(),
})

export const GameStateSchema = z.object({
  emulator: z.object({
    frame: z.number().int().min(0),
    romLoaded: z.boolean(),
    saveStateLoaded: z.boolean(),
  }),
  player: z.object({
    name: z.string().nullable(),
    tile: PositionSchema.nullable(),
    facing: z.string().nullable(),
    rivalName: z.string().nullable().optional(),
    money: z.number().int().nullable().optional(),
    playTime: z.string().nullable().optional(),
    pokedexOwned: z.number().int().nullable().optional(),
    pokedexSeen: z.number().int().nullable().optional(),
  }),
  map: z.object({
    id: z.number().int().nullable(),
    name: z.string().nullable(),
  }),
  party: z.array(
    z.object({
      species: z.string().nullable(),
      level: z.number().int().nullable(),
      hp: z.number().int().nullable(),
      maxHp: z.number().int().nullable(),
      status: z.string().nullable(),
      nickname: z.string().nullable().optional(),
      types: z.array(z.string()).optional(),
      moves: z.array(z.string()).optional(),
      stats: PartyStatsSchema.nullable().optional(),
    }),
  ),
  bag: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().int(),
    }),
  ),
  badges: z.object({
    owned: z.array(z.string()),
  }),
  battle: z.object({
    active: z.boolean(),
    kind: z.string().nullable(),
    opponent: z.string().nullable(),
    enemy: BattleEnemySchema.nullable().optional(),
  }),
  dialog: z.object({
    active: z.boolean(),
    text: z.string().nullable(),
  }),
  flags: z.object({
    values: z.record(z.string(), z.boolean()),
  }),
  collision: z.object({
    mapId: z.number().int().nullable(),
    mapName: z.string().nullable(),
    width: z.number().int().min(0),
    height: z.number().int().min(0),
    grid: z.array(z.array(z.boolean())),
    playerTile: PositionSchema.nullable(),
    passableDirections: z.array(z.string()),
    ascii: z.string().nullable().optional(),
    playerCell: z.string().nullable().optional(),
  }),
  parserWarnings: z.array(z.string()),
})

export const ScreenshotSchema = z.object({
  pngBase64: z.string(),
  frame: z.number().int().min(0).optional(),
  width: z.number().int().min(0).optional(),
  height: z.number().int().min(0).optional(),
})

export const ObservationSchema = z.object({
  type: z.literal("observation"),
  timestamp: z.string(),
  frame: z.number().int().min(0),
  state: GameStateSchema,
  screenshot: ScreenshotSchema,
  lastAction: ActionRequestSchema.nullable(),
  parserWarnings: z.array(z.string()),
})

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  romLoaded: z.boolean(),
  saveStateLoaded: z.boolean(),
  frame: z.number().int().min(0),
  activeControllerId: z.string().nullable(),
})

export const ControlRequestSchema = z.object({
  controllerId: z.string().min(1),
})

export const ControlLeaseResponseSchema = z.object({
  status: z.enum(["active", "released", "ignored"]),
  activeControllerId: z.string().nullable(),
})

export const ActionResponseSchema = z.object({
  accepted: z.boolean(),
  frameBefore: z.number().int().min(0),
  frameAfter: z.number().int().min(0),
  observation: ObservationSchema,
})

export const DashboardEventRequestSchema = z.object({
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  type: z.enum(["reasoning", "decision", "key_moment", "alert", "battle", "action"]),
})

export const EventWriteResponseSchema = z.object({
  broadcastTo: z.number().int().min(0),
  success: z.boolean(),
})

export const ResetModeSchema = z.enum(["rom", "initial_save_state"])

export const CommandStatusResponseSchema = z.object({
  status: z.enum(["saved", "loaded", "reset"]),
  name: z.string().nullable().optional(),
  mode: ResetModeSchema.nullable().optional(),
})

export type ActionRequest = z.infer<typeof ActionRequestSchema>
export type ActionResponse = z.infer<typeof ActionResponseSchema>
export type CommandStatusResponse = z.infer<typeof CommandStatusResponseSchema>
export type ControlLeaseResponse = z.infer<typeof ControlLeaseResponseSchema>
export type ControlRequest = z.infer<typeof ControlRequestSchema>
export type DashboardEventRequest = z.infer<typeof DashboardEventRequestSchema>
export type EventWriteResponse = z.infer<typeof EventWriteResponseSchema>
export type GameState = z.infer<typeof GameStateSchema>
export type HealthResponse = z.infer<typeof HealthResponseSchema>
export type Observation = z.infer<typeof ObservationSchema>
export type ResetMode = z.infer<typeof ResetModeSchema>
export type Screenshot = z.infer<typeof ScreenshotSchema>

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

  return Number.parseInt(value, 10)
}

class UnsupportedActionTokenError extends Error {
  constructor(readonly token: string) {
    super(`unsupported action token: ${token}`)
    this.name = "UnsupportedActionTokenError"
  }
}
