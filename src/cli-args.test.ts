import { describe, expect, test } from "bun:test"
import { parseCliArgs } from "./cli-args"

describe("parseCliArgs", () => {
  test("defaults to a new backend session", () => {
    const args = parseCliArgs([])

    expect(args.backendSessionMode).toBe("new")
    expect(args.backendMode).toBeUndefined()
  })

  test("selects resume mode when requested", () => {
    const args = parseCliArgs(["--resume"])

    expect(args.backendSessionMode).toBe("resume")
  })

  test("lets explicit new mode override resume order", () => {
    const args = parseCliArgs(["--resume", "--new"])

    expect(args.backendSessionMode).toBe("new")
    expect(args.forceNewBackendSession).toBe(true)
  })

  test("parses backend mode override", () => {
    const args = parseCliArgs(["--backend-mode", "fake"])

    expect(args.backendMode).toBe("fake")
  })

  test("rejects malformed backend mode", () => {
    expect(() => parseCliArgs(["--backend-mode", "debug"])).toThrow(
      "unsupported --backend-mode debug",
    )
  })
})
