import { z } from "zod"

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

export type GameState = z.infer<typeof GameStateSchema>
