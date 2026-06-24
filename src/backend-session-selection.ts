import { select } from "@inquirer/prompts"
import { NoRunningBackendSessionsError } from "./backend-session-errors"
import type { BackendSessionRecord } from "./backend-session-types"

export function selectBackendSessionInteractively(
  sessions: readonly BackendSessionRecord[],
): Promise<BackendSessionRecord> {
  return select({
    choices: sessions.map((session) => ({
      name: sessionChoiceLabel(session),
      value: session,
    })),
    message: "Resume backend session",
  })
}

export function selectFirstSession(
  sessions: readonly BackendSessionRecord[],
): Promise<BackendSessionRecord> {
  const first = sessions[0]
  if (first === undefined) {
    throw new NoRunningBackendSessionsError()
  }
  return Promise.resolve(first)
}

function sessionChoiceLabel(session: BackendSessionRecord): string {
  const label = session.label === null ? "" : ` ${session.label}`
  return `${session.id}${label} ${session.mode} ${session.url} pid=${session.pid}`
}
