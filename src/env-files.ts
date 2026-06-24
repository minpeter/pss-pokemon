import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { config as loadEnv, parse as parseEnv } from "dotenv"

const CLI_SRC_DIR = dirname(fileURLToPath(import.meta.url))

export const DEFAULT_ENV_FILES = [
  resolve(CLI_SRC_DIR, "../.env"),
  resolve(CLI_SRC_DIR, "../backend/.env"),
] as const

export type RuntimeEnv = Readonly<Record<string, string | undefined>>

export function loadDefaultEnvFiles(): void {
  for (const path of DEFAULT_ENV_FILES) {
    loadEnv({ path, quiet: true, override: true })
  }
}

export function readEnvValuesFromFiles({
  envFiles = DEFAULT_ENV_FILES,
  runtimeEnv = process.env,
}: {
  readonly envFiles?: readonly string[]
  readonly runtimeEnv?: RuntimeEnv
} = {}): Record<string, string | undefined> {
  const env = { ...runtimeEnv }
  for (const path of envFiles) {
    if (existsSync(path)) {
      Object.assign(env, parseEnv(readFileSync(path)))
    }
  }
  return env
}
