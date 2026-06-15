import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import {
  createInMemoryPokemonAgentMemory,
  EMPTY_MEMORY_PROJECTION,
  type PokemonAgentMemory,
  type PokemonAgentMemoryRecord,
  type PokemonMemoryProjection,
  PokemonMemoryProjectionSchema,
} from "./agent-memory"
import type { PokemonActionExecution } from "./pokemon-action-executor"

const EPISODES_FILE = "episodes.jsonl"
const PROJECTION_FILE = "projection.json"

export interface FilePokemonAgentMemoryOptions {
  readonly rootDir: string
  readonly sessionId: string
}

interface MemoryEpisode {
  readonly actionSummary: string
  readonly frame: number
  readonly mapId: number | null
  readonly mapName: string | null
  readonly tile: string
  readonly timestamp: string
  readonly turn: number
  readonly verification: string
}

export async function createFilePokemonAgentMemory({
  rootDir,
  sessionId,
}: FilePokemonAgentMemoryOptions): Promise<PokemonAgentMemory> {
  const resolvedRootDir = resolve(rootDir)
  const sessionDir = resolve(resolvedRootDir, sanitizeSessionId(sessionId))
  if (!isPathInside(sessionDir, resolvedRootDir)) {
    throw new Error("agent memory session path escaped memory root")
  }
  await mkdir(sessionDir, { recursive: true })
  const projectionPath = join(sessionDir, PROJECTION_FILE)
  const episodesPath = join(sessionDir, EPISODES_FILE)
  const projection = await readProjection(projectionPath)
  return createInMemoryPokemonAgentMemory(projection, async (record) => {
    await appendEpisode({ episodesPath, record })
    await writeProjection({ path: projectionPath, projection: record.projection })
  })
}

export function defaultPokemonMemoryRootDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", ".local", "agent-memory")
}

async function readProjection(path: string): Promise<PokemonMemoryProjection> {
  try {
    const text = await readFile(path, "utf8")
    const parsed: unknown = JSON.parse(text)
    return PokemonMemoryProjectionSchema.parse(parsed)
  } catch (error) {
    if (readErrorCode(error) === "ENOENT") {
      return EMPTY_MEMORY_PROJECTION
    }
    throw error
  }
}

async function appendEpisode({
  episodesPath,
  record,
}: {
  readonly episodesPath: string
  readonly record: PokemonAgentMemoryRecord
}): Promise<void> {
  await appendFile(`${episodesPath}`, `${JSON.stringify(createEpisode(record))}\n`, "utf8")
}

async function writeProjection({
  path,
  projection,
}: {
  readonly path: string
  readonly projection: PokemonMemoryProjection
}): Promise<void> {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(projection, null, 2)}\n`, "utf8")
  await rename(temporaryPath, path)
}

function createEpisode({ execution, turn }: PokemonAgentMemoryRecord): MemoryEpisode {
  const observation = execution.response.observation
  return {
    actionSummary: summarizeAction(execution),
    frame: observation.frame,
    mapId: observation.state.map.id,
    mapName: observation.state.map.name,
    tile:
      observation.state.player.tile === null
        ? "unknown"
        : `x=${observation.state.player.tile.x}, y=${observation.state.player.tile.y}`,
    timestamp: observation.timestamp,
    turn,
    verification: execution.verification.summary,
  }
}

function summarizeAction(execution: PokemonActionExecution): string {
  const action = execution.response.observation.lastAction
  if (action === null) {
    return "unknown_action"
  }
  if ("sequence" in action) {
    return `${action.sequence.length} step(s)`
  }
  return "unknown_action"
}

function sanitizeSessionId(sessionId: string): string {
  const sanitized = sessionId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
  return sanitized.length === 0 ? "pokemon-agent" : sanitized
}

function isPathInside(path: string, rootDir: string): boolean {
  const relativePath = relative(rootDir, path)
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  )
}

function readErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null
  }
  const descriptor = Object.getOwnPropertyDescriptor(error, "code")
  const value = descriptor?.value
  return typeof value === "string" ? value : null
}
