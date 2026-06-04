import { z } from "zod"
import { DEFAULT_ENV_FILES, type RuntimeEnv, readEnvValuesFromFiles } from "./env-files"

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8765"

const HumanEnvSchema = z.object({
  backendUrl: z.url(),
})

export type HumanEnv = z.infer<typeof HumanEnvSchema>

export function readHumanEnv(): HumanEnv {
  return readHumanEnvFromFiles()
}

export function readHumanEnvFromFiles({
  envFiles = DEFAULT_ENV_FILES,
  runtimeEnv = process.env,
}: {
  readonly envFiles?: readonly string[]
  readonly runtimeEnv?: RuntimeEnv
} = {}): HumanEnv {
  const env = readEnvValuesFromFiles({ envFiles, runtimeEnv })

  return HumanEnvSchema.parse({
    backendUrl: env["POKEMON_BACKEND_URL"] ?? DEFAULT_BACKEND_URL,
  })
}
