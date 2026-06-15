import { mkdir, rm } from "node:fs/promises"
import { dirname } from "node:path"
import { PokemonApiClient } from "./api-client"
import {
  BackendStartupTimeoutError,
  MissingRealRomPathError,
  PortAllocationError,
} from "./backend-session-errors"
import { DEFAULT_HEALTH_POLL_INTERVAL_MS, DEFAULT_HOST } from "./backend-session-paths"
import type { HealthProbe, ProcessSpawnRequest, ProcessSpawnResult } from "./backend-session-types"
import type { BackendMode } from "./cli-args"
import { KyJsonTransport } from "./transport"

export function backendCommand(backendMode: BackendMode, port: number): readonly string[] {
  return [
    "uv",
    "run",
    "uvicorn",
    backendMode === "fake" ? "pokemon_harness.fake_main:app" : "pokemon_harness.main:app",
    "--host",
    DEFAULT_HOST,
    "--port",
    String(port),
  ]
}

export function assertCanStartManagedBackend({
  backendMode,
  runtimeEnv,
}: {
  readonly backendMode: BackendMode
  readonly runtimeEnv: Readonly<Record<string, string | undefined>>
}): void {
  if (backendMode === "real" && runtimeEnv["POKEMON_ROM_PATH"] === undefined) {
    throw new MissingRealRomPathError()
  }
}

export function backendEnv({
  backendMode,
  port,
  runtimeEnv,
}: {
  readonly backendMode: BackendMode
  readonly port: number
  readonly runtimeEnv: Readonly<Record<string, string | undefined>>
}): Readonly<Record<string, string>> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(runtimeEnv)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  env["POKEMON_HOST"] = DEFAULT_HOST
  env["POKEMON_PORT"] = String(port)
  env["POKEMON_BACKEND_MODE"] = backendMode
  return env
}

export function createSessionId({
  date,
  port,
}: {
  readonly date: Date
  readonly port: number
}): string {
  const compact = date.toISOString().replaceAll("-", "").replaceAll(":", "")
  return `pokemon-${compact.slice(0, 8)}-${compact.slice(9, 15)}-${port}`
}

export async function waitForBackendHealth({
  healthProbe,
  logPath,
  timeoutMs,
  url,
}: {
  readonly healthProbe: HealthProbe
  readonly logPath: string
  readonly timeoutMs: number
  readonly url: string
}): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    if (await healthProbe(url)) {
      return
    }
    await Bun.sleep(DEFAULT_HEALTH_POLL_INTERVAL_MS)
  }
  throw new BackendStartupTimeoutError(url, timeoutMs, logPath)
}

export async function defaultHealthProbe(url: string): Promise<boolean> {
  try {
    await new PokemonApiClient(new KyJsonTransport(url)).health()
    return true
  } catch (error) {
    if (error instanceof Error) {
      return false
    }
    throw error
  }
}

export function defaultPidProbe(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error instanceof Error) {
      return false
    }
    throw error
  }
}

export async function allocateBackendPort(): Promise<number> {
  const { createServer } = await import("node:net")
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.on("error", (error) => {
      reject(error)
    })
    server.listen(0, DEFAULT_HOST, () => {
      const address = server.address()
      if (typeof address === "object" && address !== null) {
        const port = address.port
        server.close(() => {
          resolvePort(port)
        })
        return
      }
      server.close(() => {
        reject(new PortAllocationError())
      })
    })
  })
}

export async function spawnBackendProcess(
  request: ProcessSpawnRequest,
): Promise<ProcessSpawnResult> {
  await mkdir(dirname(request.logPath), { recursive: true })
  await rm(request.logPath, { force: true })
  const subprocess = Bun.spawn([...request.command], {
    cwd: request.cwd,
    detached: true,
    env: request.env,
    stderr: Bun.file(request.logPath),
    stdin: "ignore",
    stdout: Bun.file(request.logPath),
  })
  subprocess.unref()
  return { pid: subprocess.pid }
}

export async function defaultProcessStopper(pid: number): Promise<void> {
  try {
    process.kill(-pid, "SIGTERM")
  } catch (error) {
    if (isMissingProcessError(error)) {
      process.kill(pid, "SIGTERM")
      return
    }
    throw error
  }
}

function isMissingProcessError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ESRCH"
}
