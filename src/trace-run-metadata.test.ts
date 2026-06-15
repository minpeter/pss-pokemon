import { describe, expect, test } from "bun:test"
import { createHumanTraceRunMetadata } from "./trace-run-metadata"

describe("trace run metadata", () => {
  test("uses deterministic metadata for keyboard-owned human replay traces", () => {
    // Given
    const backend = {
      backendUrl: "http://127.0.0.1:8765",
      source: "external",
    } as const

    // When
    const metadata = createHumanTraceRunMetadata({
      backend,
      backendMode: "fake",
    })

    // Then
    expect(metadata.controllerMode).toBe("deterministic_only")
    expect(metadata.model.id).toBe("human")
    expect(metadata.romIdentity).toEqual({
      kind: "unknown",
      reason: "external backend does not expose ROM identity to CLI traces",
    })
  })
})
