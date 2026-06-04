export class AgentRunError extends Error {
  constructor(readonly errorMessage: string) {
    super(`agent run failed: ${errorMessage}`)
    this.name = "AgentRunError"
  }
}

export class ControllerConflictError extends AgentRunError {
  constructor(
    readonly activeControllerId: string,
    readonly requestedControllerId: string,
  ) {
    super(
      [
        `controller conflict: backend active controller is ${activeControllerId}, but requested controller is ${requestedControllerId}.`,
        `Stop the active controller, wait for its lease to expire, or set POKEMON_AGENT_CONTROLLER_ID=${activeControllerId}.`,
      ].join(" "),
    )
    this.name = "ControllerConflictError"
  }
}
