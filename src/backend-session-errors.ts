export class MissingExternalBackendUrlError extends Error {
  readonly name = "MissingExternalBackendUrlError"

  constructor() {
    super("external backend mode requires POKEMON_BACKEND_URL")
  }
}

export class MissingRealRomPathError extends Error {
  readonly name = "MissingRealRomPathError"

  constructor() {
    super(
      [
        "managed real backend sessions require POKEMON_ROM_PATH",
        "Set POKEMON_ROM_PATH in .env, use POKEMON_BACKEND_URL=http://127.0.0.1:8765 for an already-running backend, or set POKEMON_BACKEND_MODE=fake for ROM-less checks.",
      ].join(". "),
    )
  }
}

export class NoRunningBackendSessionsError extends Error {
  readonly name = "NoRunningBackendSessionsError"

  constructor() {
    super("No running backend sessions found. Start without --resume to create one.")
  }
}

export class BackendStartupTimeoutError extends Error {
  readonly name = "BackendStartupTimeoutError"

  constructor(
    readonly url: string,
    readonly timeoutMs: number,
    readonly logPath: string,
  ) {
    super(`backend at ${url} did not become healthy within ${timeoutMs}ms; log: ${logPath}`)
  }
}

export class PortAllocationError extends Error {
  readonly name = "PortAllocationError"

  constructor() {
    super("failed to allocate a backend port")
  }
}

export class RegistryLockTimeoutError extends Error {
  readonly name = "RegistryLockTimeoutError"

  constructor(readonly lockPath: string) {
    super(`timed out waiting for backend session registry lock: ${lockPath}`)
  }
}

export class UnsafeProcessStopError extends Error {
  readonly name = "UnsafeProcessStopError"

  constructor(readonly pid: number) {
    super(`refusing to stop unsafe backend process pid: ${pid}`)
  }
}
