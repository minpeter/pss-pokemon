import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const CLI_SRC_DIR = dirname(fileURLToPath(import.meta.url))

export const DEFAULT_HOST = "127.0.0.1"
export const DEFAULT_STARTUP_TIMEOUT_MS = 10_000
export const DEFAULT_HEALTH_POLL_INTERVAL_MS = 100

export function defaultBackendSessionRootDir(): string {
  return join(defaultRepoRootDir(), ".local", "backend-sessions")
}

export function defaultRepoRootDir(): string {
  return resolve(CLI_SRC_DIR, "..")
}
