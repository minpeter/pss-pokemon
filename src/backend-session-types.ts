import { z } from "zod"
import type { BackendMode, BackendSessionMode } from "./cli-args"

export const REGISTRY_VERSION = 1

export const BackendSessionRecordSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.string().min(1),
  label: z.string().min(1).nullable(),
  mode: z.enum(["real", "fake"]),
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65_535),
  url: z.url(),
})

export const BackendSessionRegistrySchema = z.object({
  sessions: z.array(BackendSessionRecordSchema),
  version: z.literal(REGISTRY_VERSION),
})

export type BackendSessionRecord = z.infer<typeof BackendSessionRecordSchema>
export type BackendSessionRegistry = z.infer<typeof BackendSessionRegistrySchema>

export type PreparedBackendSession =
  | {
      readonly backendUrl: string
      readonly session: BackendSessionRecord
      readonly source: "new" | "resume"
    }
  | {
      readonly backendUrl: string
      readonly source: "external"
    }

export type ProcessSpawnRequest = {
  readonly command: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly logPath: string
}

export type ProcessSpawnResult = {
  readonly pid: number
}

export type ProcessSpawner = (request: ProcessSpawnRequest) => Promise<ProcessSpawnResult>
export type PidProbe = (pid: number) => boolean
export type PortAllocator = () => Promise<number>
export type HealthProbe = (url: string) => Promise<boolean>
export type Clock = () => Date

export type SessionSelector = (
  sessions: readonly BackendSessionRecord[],
) => Promise<BackendSessionRecord>

export type ProcessStopper = (pid: number) => Promise<void>

export type PrepareBackendSessionOptions = {
  readonly backendMode: BackendMode
  readonly clock?: Clock
  readonly externalBackendUrl?: string
  readonly healthProbe?: HealthProbe
  readonly launchMode: BackendSessionMode
  readonly pidProbe?: PidProbe
  readonly portAllocator?: PortAllocator
  readonly processSpawner?: ProcessSpawner
  readonly registryRootDir?: string
  readonly repoRootDir?: string
  readonly runtimeEnv: Readonly<Record<string, string | undefined>>
  readonly sessionSelector?: SessionSelector
  readonly startupTimeoutMs?: number
}
