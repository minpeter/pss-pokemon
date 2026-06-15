import { z } from "zod"
import type { Direction, GameState } from "./schemas"

export const WorldModelProvenanceSchema = z
  .object({
    license: z.string().min(1),
    source: z.string().min(1),
    sourceKind: z.enum(["hand_authored", "runtime_trace", "external_reference"]),
  })
  .strict()

export const WorldTileSchema = z
  .object({
    x: z.number().int(),
    y: z.number().int(),
  })
  .strict()

export const BlockedEdgeSchema = z
  .object({
    direction: z.enum(["up", "down", "left", "right"]),
    from: WorldTileSchema,
    mapId: z.number().int().nullable(),
    mapName: z.string().min(1),
    provenance: WorldModelProvenanceSchema,
  })
  .strict()

export const WorldTransitionSchema = z
  .object({
    fromMapName: z.string().min(1),
    fromTile: WorldTileSchema,
    toMapName: z.string().min(1),
    toTile: WorldTileSchema.optional(),
    provenance: WorldModelProvenanceSchema,
  })
  .strict()

export const RouteGoalSchema = z
  .object({
    goalId: z.string().min(1),
    mapName: z.string().min(1),
    tile: WorldTileSchema.optional(),
    provenance: WorldModelProvenanceSchema,
  })
  .strict()

export const WorldModelSchema = z
  .object({
    blockedEdges: z.array(BlockedEdgeSchema),
    frontier: z.array(WorldTileSchema),
    modelId: z.string().min(1),
    provenance: WorldModelProvenanceSchema,
    routeGoals: z.array(RouteGoalSchema),
    transitions: z.array(WorldTransitionSchema),
    type: z.literal("red_blue_world_model"),
  })
  .strict()

export type WorldModel = z.infer<typeof WorldModelSchema>
export type BlockedEdge = z.infer<typeof BlockedEdgeSchema>

const HAND_AUTHORED_PROVENANCE = {
  license: "project-local synthetic test data",
  source: "hand-authored pss-pokemon minimal Pallet Town fixture",
  sourceKind: "hand_authored",
} as const

export function createMinimalRedBlueWorldModel(): WorldModel {
  return WorldModelSchema.parse({
    blockedEdges: [],
    frontier: [{ x: 5, y: 4 }],
    modelId: "red-blue-minimal-v1",
    provenance: HAND_AUTHORED_PROVENANCE,
    routeGoals: [
      {
        goalId: "redblue.pallet_to_route1",
        mapName: "Pallet Town",
        tile: { x: 5, y: 0 },
        provenance: HAND_AUTHORED_PROVENANCE,
      },
    ],
    transitions: [
      {
        fromMapName: "Pallet Town",
        fromTile: { x: 5, y: 0 },
        toMapName: "Route 1",
        provenance: HAND_AUTHORED_PROVENANCE,
      },
    ],
    type: "red_blue_world_model",
  })
}

export function recordBlockedEdge(
  model: WorldModel,
  edge: Omit<BlockedEdge, "provenance">,
): WorldModel {
  return WorldModelSchema.parse({
    ...model,
    blockedEdges: [...model.blockedEdges, { ...edge, provenance: HAND_AUTHORED_PROVENANCE }],
  })
}

export function blockedEdgeAdvice({
  direction,
  model,
  state,
}: {
  readonly direction: Direction
  readonly model: WorldModel
  readonly state: GameState
}): string | null {
  const tile = state.player.tile
  if (tile === null || state.map.name === null) {
    return null
  }
  const blocked = model.blockedEdges.find(
    (edge) =>
      edge.direction === direction &&
      edge.mapId === state.map.id &&
      edge.mapName === state.map.name &&
      edge.from.x === tile.x &&
      edge.from.y === tile.y,
  )
  return blocked === undefined
    ? null
    : `blocked edge advisory: ${blocked.mapName} x=${tile.x}, y=${tile.y} ${direction}`
}
