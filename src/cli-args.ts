import { z } from "zod"

export const BackendSessionModeSchema = z.enum(["new", "resume", "external"])
export type BackendSessionMode = z.infer<typeof BackendSessionModeSchema>

export const BackendModeSchema = z.enum(["real", "fake"])
export type BackendMode = z.infer<typeof BackendModeSchema>

export type CliArgs = {
  readonly backendMode?: BackendMode
  readonly backendSessionMode: Exclude<BackendSessionMode, "external">
  readonly forceNewBackendSession: boolean
}

export function parseCliArgs(argv: readonly string[]): CliArgs {
  let backendMode: BackendMode | undefined
  let forceNewBackendSession = false
  let backendSessionMode: Exclude<BackendSessionMode, "external"> = "new"

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    switch (token) {
      case "--resume":
        backendSessionMode = "resume"
        break
      case "--new":
        backendSessionMode = "new"
        forceNewBackendSession = true
        break
      case "--backend-mode": {
        const value = argv[index + 1]
        const parsed = BackendModeSchema.safeParse(value)
        if (!parsed.success) {
          throw new UnsupportedBackendModeError(value ?? "")
        }
        backendMode = parsed.data
        index += 1
        break
      }
      default:
        throw new UnsupportedCliArgumentError(token ?? "")
    }
  }

  return {
    ...(backendMode === undefined ? {} : { backendMode }),
    backendSessionMode,
    forceNewBackendSession,
  }
}

export class UnsupportedBackendModeError extends Error {
  readonly name = "UnsupportedBackendModeError"

  constructor(readonly mode: string) {
    super(`unsupported --backend-mode ${mode}`)
  }
}

export class UnsupportedCliArgumentError extends Error {
  readonly name = "UnsupportedCliArgumentError"

  constructor(readonly argument: string) {
    super(`unsupported CLI argument ${argument}`)
  }
}
