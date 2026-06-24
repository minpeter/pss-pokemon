import { z } from "zod"
import { ActionRequestSchema } from "./action-schemas"
import { GameStateSchema } from "./game-state-schemas"

export const ScreenshotSchema = z.object({
  abiVersion: z.literal("v1").optional(),
  pngBase64: z.string(),
  frame: z.number().int().min(0).optional(),
  width: z.number().int().min(0).optional(),
  height: z.number().int().min(0).optional(),
})

export const ObservationSchema = z.object({
  type: z.literal("observation"),
  abiVersion: z.literal("v1").optional(),
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

export type ActionResponse = z.infer<typeof ActionResponseSchema>
export type CommandStatusResponse = z.infer<typeof CommandStatusResponseSchema>
export type ControlLeaseResponse = z.infer<typeof ControlLeaseResponseSchema>
export type ControlRequest = z.infer<typeof ControlRequestSchema>
export type DashboardEventRequest = z.infer<typeof DashboardEventRequestSchema>
export type EventWriteResponse = z.infer<typeof EventWriteResponseSchema>
export type HealthResponse = z.infer<typeof HealthResponseSchema>
export type Observation = z.infer<typeof ObservationSchema>
export type ResetMode = z.infer<typeof ResetModeSchema>
export type Screenshot = z.infer<typeof ScreenshotSchema>
