import { describe, expect, test } from "bun:test"
import { runBackendSessionCli } from "./backend-session-cli"
import type { BackendSessionRecord } from "./backend-session-manager"

describe("backend session CLI", () => {
  test("passes configured session root to list", async () => {
    const roots: string[] = []
    const output: string[] = []

    await runBackendSessionCli({
      argv: ["list"],
      listLiveSessions: (options: { readonly registryRootDir?: string } = {}) => {
        roots.push(options.registryRootDir ?? "")
        return Promise.resolve([])
      },
      runtimeEnv: {
        POKEMON_BACKEND_SESSION_ROOT: ".local/custom-sessions",
      },
      writeOutput: (line: string) => {
        output.push(line)
      },
    })

    expect(roots).toEqual([".local/custom-sessions"])
    expect(output).toEqual(["No running backend sessions."])
  })

  test("passes configured session root to stop", async () => {
    const calls: Array<{ readonly registryRootDir: string; readonly sessionId: string }> = []

    await runBackendSessionCli({
      argv: ["stop", "session-1"],
      runtimeEnv: {
        POKEMON_BACKEND_SESSION_ROOT: ".local/custom-sessions",
      },
      stopSession: (options: { readonly registryRootDir?: string; readonly sessionId: string }) => {
        calls.push({ registryRootDir: options.registryRootDir ?? "", sessionId: options.sessionId })
        return Promise.resolve({ stopped: true })
      },
      writeOutput: () => {},
    })

    expect(calls).toEqual([{ registryRootDir: ".local/custom-sessions", sessionId: "session-1" }])
  })
})

export function fakeSession(): BackendSessionRecord {
  return {
    createdAt: "2026-06-08T00:00:00.000Z",
    id: "session-1",
    label: null,
    mode: "fake",
    pid: 111,
    port: 18765,
    url: "http://127.0.0.1:18765",
  }
}
