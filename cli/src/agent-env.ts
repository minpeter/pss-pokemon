import { z } from "zod"
import { HUMAN_CONTROLLER_ID, HUMAN_MODEL_ID } from "./control-modes"
import {
  DEFAULT_ENV_FILES,
  loadDefaultEnvFiles,
  type RuntimeEnv,
  readEnvValuesFromFiles,
} from "./env-files"

const DEFAULT_AI_BASE_URL = "https://codex.nekos.me/v1"
const DEFAULT_BACKEND_URL = "http://127.0.0.1:8765"
const DEFAULT_CONTROLLER_ID = "agent-cli"
const DEFAULT_MODEL = "gpt-5.5"
const DEFAULT_SESSION_ID = "pokemon-agent"

const AgentEnvSchema = z.object({
  aiApiKey: z.string().min(1).optional(),
  aiBaseUrl: z.url(),
  backendUrl: z.url(),
  controllerId: z.string().min(1),
  modelId: z.string().min(1),
  sessionId: z.string().min(1),
})

export type AgentEnv = z.infer<typeof AgentEnvSchema>

export function readAgentEnv(): AgentEnv {
  loadDefaultEnvFiles()

  return readAgentEnvFromFiles({
    envFiles: [],
    runtimeEnv: process.env,
  })
}

export function readAgentEnvFromFiles({
  envFiles = DEFAULT_ENV_FILES,
  runtimeEnv = process.env,
}: {
  readonly envFiles?: readonly string[]
  readonly runtimeEnv?: RuntimeEnv
} = {}): AgentEnv {
  const env = readEnvValuesFromFiles({ envFiles, runtimeEnv })
  const modelId = firstDefined(env, "POKEMON_AI_MODEL", "AI_MODEL") ?? DEFAULT_MODEL

  return AgentEnvSchema.parse({
    aiApiKey: firstDefined(env, "POKEMON_AI_API_KEY", "AI_API_KEY"),
    aiBaseUrl: firstDefined(env, "POKEMON_AI_BASE_URL", "AI_BASE_URL") ?? DEFAULT_AI_BASE_URL,
    backendUrl: env["POKEMON_BACKEND_URL"] ?? DEFAULT_BACKEND_URL,
    controllerId:
      env["POKEMON_AGENT_CONTROLLER_ID"] ??
      (modelId === HUMAN_MODEL_ID ? HUMAN_CONTROLLER_ID : DEFAULT_CONTROLLER_ID),
    modelId,
    sessionId: env["POKEMON_AGENT_SESSION_ID"] ?? DEFAULT_SESSION_ID,
  })
}

function firstDefined(
  env: Readonly<Record<string, string | undefined>>,
  primary: string,
  fallback: string,
): string | undefined {
  return env[primary] ?? env[fallback]
}
