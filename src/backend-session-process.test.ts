import { describe, expect, test } from "bun:test"
import { UnsafeProcessStopError } from "./backend-session-errors"
import { defaultProcessStopper } from "./backend-session-process"

describe("backend session process stopper", () => {
  test("rejects unsafe process ids before signaling", async () => {
    try {
      await defaultProcessStopper(1)
      throw new Error("expected unsafe process stop error")
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafeProcessStopError)
    }
  })
})
