import { describe, expect, test } from "bun:test"
import {
  BackendKindSchema,
  ControllerModeSchema,
  createUnknownRomIdentity,
  HarnessRunMetadataSchema,
  PrivilegeLevelSchema,
  parseHarnessRunMetadata,
  RomIdentitySchema,
  SelfImprovementModeSchema,
} from "./privilege-ladder"

const validMetadata = {
  backendKind: "pyboy_fake",
  controllerMode: "llm_macro_deterministic_micro",
  model: {
    id: "human",
    provider: "local",
  },
  objectiveId: "redblue.pallet_fake_smoke",
  privilegeLevel: "ram_lite",
  romIdentity: {
    kind: "unknown",
    reason: "fake backend smoke run",
  },
  selfImprovementMode: "proposal_only",
  temperature: 0,
  type: "harness_run_metadata",
} as const

describe("privilege ladder metadata", () => {
  test("defines privilege, controller, self-improvement, and backend axes", () => {
    expect(PrivilegeLevelSchema.options).toEqual([
      "pixels_only",
      "pixels_text",
      "ram_lite",
      "ram_full",
      "external_guidebook",
    ])
    expect(ControllerModeSchema.options).toEqual([
      "llm_buttons",
      "llm_macro_deterministic_micro",
      "deterministic_only",
    ])
    expect(SelfImprovementModeSchema.options).toEqual(["none", "proposal_only", "qa_gated"])
    expect(BackendKindSchema.options).toEqual([
      "pyboy_fake",
      "pyboy_real",
      "mgba_http",
      "pokeagent",
    ])
  })

  test("accepts complete run metadata for benchmark recording", () => {
    const parsed = parseHarnessRunMetadata(validMetadata)

    expect(parsed).toEqual(validMetadata)
  })

  test.each([
    "backendKind",
    "controllerMode",
    "model",
    "objectiveId",
    "privilegeLevel",
    "romIdentity",
    "selfImprovementMode",
    "temperature",
  ] as const)("rejects metadata missing %s", (field) => {
    const metadata = { ...validMetadata }
    Reflect.deleteProperty(metadata, field)

    expect(() => HarnessRunMetadataSchema.parse(metadata)).toThrow()
  })

  test("rejects unknown objectives and comparative extras", () => {
    expect(() =>
      HarnessRunMetadataSchema.parse({
        ...validMetadata,
        objectiveId: "redblue.full_game",
      }),
    ).toThrow()
    expect(() =>
      HarnessRunMetadataSchema.parse({
        ...validMetadata,
        completionRate: 1,
      }),
    ).toThrow()
  })

  test("requires either an explicit unknown ROM placeholder or a full sha256", () => {
    expect(createUnknownRomIdentity("local no-ROM test")).toEqual({
      kind: "unknown",
      reason: "local no-ROM test",
    })
    expect(
      RomIdentitySchema.parse({
        game: "red",
        kind: "known",
        sha256: "a".repeat(64),
      }),
    ).toEqual({
      game: "red",
      kind: "known",
      sha256: "a".repeat(64),
    })
    expect(() =>
      RomIdentitySchema.parse({
        game: "red",
        kind: "known",
        sha256: "not-a-sha",
      }),
    ).toThrow()
  })
})
