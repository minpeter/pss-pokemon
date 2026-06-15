import {
  type BackendSessionRecord,
  listLiveBackendSessions,
  stopBackendSession,
} from "./backend-session-manager"
import type { RuntimeEnv } from "./env-files"

type SessionCommand = "list" | "prune" | "stop"

const DEFAULT_BACKEND_SESSION_ROOT_DIR = ".local/backend-sessions"

export type BackendSessionCliOptions = {
  readonly argv?: readonly string[]
  readonly listLiveSessions?: typeof listLiveBackendSessions
  readonly runtimeEnv?: RuntimeEnv
  readonly stopSession?: typeof stopBackendSession
  readonly writeOutput?: (line: string) => void
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  await runBackendSessionCli({ argv })
}

export async function runBackendSessionCli({
  argv = process.argv.slice(2),
  listLiveSessions = listLiveBackendSessions,
  runtimeEnv = process.env,
  stopSession: stopBackend = stopBackendSession,
  writeOutput = (line) => {
    process.stdout.write(`${line}\n`)
  },
}: BackendSessionCliOptions = {}): Promise<void> {
  const [commandToken, sessionId] = argv
  const command = parseSessionCommand(commandToken)
  const registryRootDir =
    runtimeEnv["POKEMON_BACKEND_SESSION_ROOT"] ?? DEFAULT_BACKEND_SESSION_ROOT_DIR
  switch (command) {
    case "list":
      await listSessions({ listLiveSessions, registryRootDir, writeOutput })
      return
    case "prune":
      await pruneSessions({ listLiveSessions, registryRootDir, writeOutput })
      return
    case "stop":
      await stopSession({
        registryRootDir,
        sessionId,
        stopBackend,
        writeOutput,
      })
      return
    default:
      assertNever(command)
  }
}

async function listSessions({
  listLiveSessions,
  registryRootDir,
  writeOutput,
}: {
  readonly listLiveSessions: typeof listLiveBackendSessions
  readonly registryRootDir: string
  readonly writeOutput: (line: string) => void
}): Promise<void> {
  const sessions: readonly BackendSessionRecord[] = await listLiveSessions({ registryRootDir })
  for (const session of sessions) {
    writeOutput(JSON.stringify(session))
  }
  if (sessions.length === 0) {
    writeOutput("No running backend sessions.")
  }
}

async function pruneSessions({
  listLiveSessions,
  registryRootDir,
  writeOutput,
}: {
  readonly listLiveSessions: typeof listLiveBackendSessions
  readonly registryRootDir: string
  readonly writeOutput: (line: string) => void
}): Promise<void> {
  const sessions = await listLiveSessions({ registryRootDir })
  writeOutput(`Pruned stale sessions. ${sessions.length} running session(s).`)
}

async function stopSession({
  registryRootDir,
  sessionId,
  stopBackend,
  writeOutput,
}: {
  readonly registryRootDir: string
  readonly sessionId: string | undefined
  readonly stopBackend: typeof stopBackendSession
  readonly writeOutput: (line: string) => void
}): Promise<void> {
  if (sessionId === undefined || sessionId.length === 0) {
    throw new MissingSessionIdError()
  }
  const result = await stopBackend({ registryRootDir, sessionId })
  writeOutput(result.stopped ? `Stopped ${sessionId}` : `No such session ${sessionId}`)
}

function parseSessionCommand(command: string | undefined): SessionCommand {
  switch (command) {
    case undefined:
    case "list":
      return "list"
    case "prune":
    case "stop":
      return command
    default:
      throw new UnsupportedSessionCommandError(command)
  }
}

function assertNever(value: never): never {
  throw new UnhandledSessionCommandError(value)
}

export class MissingSessionIdError extends Error {
  readonly name = "MissingSessionIdError"

  constructor() {
    super("sessions stop requires a session id")
  }
}

export class UnsupportedSessionCommandError extends Error {
  readonly name = "UnsupportedSessionCommandError"

  constructor(readonly command: string) {
    super(`unsupported sessions command ${command}`)
  }
}

class UnhandledSessionCommandError extends Error {
  readonly name = "UnhandledSessionCommandError"

  constructor(readonly command: never) {
    super(`unhandled sessions command ${command}`)
  }
}

if (import.meta.main) {
  await main()
}
