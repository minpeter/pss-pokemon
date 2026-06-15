import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseCliArgs, UnsupportedCliArgumentError } from "./cli-args"
import {
  generateImprovementProposals,
  type ProposalCandidate,
  ProposalCandidateSchema,
  type ProposalManifest,
} from "./proposal-engine"
import {
  listProposalCandidates,
  recordProposalReview,
  showProposalCandidate,
} from "./proposal-review"
import { parseProposalsArgs } from "./proposals-main"

const fixtureTraceDir = join(import.meta.dir, "../test-fixtures/traces/fake-run")
const ACTIVE_HARNESS_SURFACES = [
  "package.json",
  "src/agent-main.ts",
  "src/agent-runtime.ts",
  "src/agent-tools.ts",
  "src/agent-memory-file-store.ts",
  "src/agent-memory-model.ts",
  "src/agent-memory-reducer.ts",
  "src/cli-args.ts",
  "src/main.ts",
  "src/pokemon-control-loop.ts",
  "src/pss-agent-settings.ts",
  "src/pss-runtime-actor.ts",
] as const

describe("QA-gated proposal engine", () => {
  test("generates proposal artifacts from a trace with evidence and rollback notes", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pokemon-proposals-"))
    const manifest = await generateImprovementProposals({
      clock: () => new Date("2026-06-15T00:00:00.000Z"),
      outputDir,
      traceDir: fixtureTraceDir,
    })

    expect(manifest.candidates).toHaveLength(2)
    const candidateFile = manifest.candidates.at(0)?.file
    if (candidateFile === undefined) {
      throw new Error("expected a proposal candidate file")
    }
    const candidate = ProposalCandidateSchema.parse(
      JSON.parse(await readFile(join(outputDir, candidateFile), "utf8")),
    )
    expect(candidate.evidence).toEqual(expect.arrayContaining([`${fixtureTraceDir}/actions.jsonl`]))
    expect(candidate.rollbackNotes).toContain("No active harness file is changed")
  })

  test("does not mutate active harness surfaces during generation or review", async () => {
    const before = await readActiveHarnessSurface()
    const outputDir = await mkdtemp(join(tmpdir(), "pokemon-proposals-review-"))
    await generateImprovementProposals({
      outputDir,
      traceDir: fixtureTraceDir,
    })
    await recordProposalReview({
      candidateId: "proposal-001",
      clock: () => new Date("2026-06-15T00:01:00.000Z"),
      note: "approved for later manual implementation",
      reviewer: "qa",
      rootDir: outputDir,
      status: "approved",
    })

    expect(await readActiveHarnessSurface()).toBe(before)
  })

  test("lists, shows, approves, rejects, and appends immutable review records", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pokemon-proposals-list-"))
    await generateImprovementProposals({
      outputDir,
      traceDir: fixtureTraceDir,
    })

    const listed = await listProposalCandidates(outputDir)
    const shown = await showProposalCandidate(outputDir, "proposal-001")
    await recordProposalReview({
      candidateId: "proposal-001",
      note: "approved for planning only",
      reviewer: "qa",
      rootDir: outputDir,
      status: "approved",
    })
    await recordProposalReview({
      candidateId: "proposal-002",
      note: "not enough evidence",
      reviewer: "qa",
      rootDir: outputDir,
      status: "rejected",
    })

    const reviewLog = await readFile(join(outputDir, "reviews.jsonl"), "utf8")
    expect(listed.at(0)?.candidate.evidence.length).toBeGreaterThan(0)
    expect(shown.candidateId).toBe("proposal-001")
    expect(reviewLog.trimEnd().split("\n")).toHaveLength(2)
    expect(reviewLog).toContain("review_recorded_no_mutation")
  })

  test("rejects traversal candidate paths across list, show, and review", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-proposals-traversal-"))
    const candidateId = "proposal-escape"
    await writeCandidateFile(join(rootDir, "../escape.json"), candidateId)
    await writeManifestFile(rootDir, "../escape.json", candidateId)

    await expectUnsafeProposalPathRejected(rootDir, candidateId)
  })

  test("rejects absolute candidate paths across list, show, and review", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-proposals-absolute-"))
    const externalDir = await mkdtemp(join(tmpdir(), "pokemon-proposals-external-"))
    const candidateId = "proposal-absolute"
    const candidatePath = join(externalDir, "absolute-candidate.json")
    await writeCandidateFile(candidatePath, candidateId)
    await writeManifestFile(rootDir, candidatePath, candidateId)

    await expectUnsafeProposalPathRejected(rootDir, candidateId)
  })

  test("records approval intent without adding a promote command", () => {
    expect(() =>
      parseProposalsArgs([
        "review",
        "--root",
        ".omo/proposals/task-26",
        "--candidate",
        "proposal-001",
        "--status",
        "approved",
        "--reviewer",
        "qa",
        "--note",
        "review only",
      ]),
    ).not.toThrow()
    expect(() => parseProposalsArgs(["promote", "--candidate", "proposal-001"])).toThrow()
  })

  test("keeps maxTurns injection-only by rejecting user-facing loop completion toggles", () => {
    for (const token of [
      "--loop",
      "--max-turns",
      "--maxTurns",
      "--turn-budget",
      "--budget",
      "--complete-after",
    ]) {
      expect(() => parseCliArgs([token])).toThrow(UnsupportedCliArgumentError)
    }
  })
})

async function readActiveHarnessSurface(): Promise<string> {
  const files = await Promise.all(
    ACTIVE_HARNESS_SURFACES.map(async (path) => {
      const text = await readFile(path, "utf8")
      return `\n--- ${path} ---\n${text}`
    }),
  )
  return files.join("\n")
}

async function expectUnsafeProposalPathRejected(
  rootDir: string,
  candidateId: string,
): Promise<void> {
  const expectedMessage = "candidate file must be a safe relative filename ending in .json"
  await expectRejectsWithMessage(() => listProposalCandidates(rootDir), expectedMessage)
  await expectRejectsWithMessage(() => showProposalCandidate(rootDir, candidateId), expectedMessage)
  await expectRejectsWithMessage(
    () =>
      recordProposalReview({
        candidateId,
        note: "must not read outside root",
        reviewer: "qa",
        rootDir,
        status: "rejected",
      }),
    expectedMessage,
  )
}

async function expectRejectsWithMessage(
  action: () => Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await action()
  } catch (error) {
    if (error instanceof Error) {
      expect(error.message).toContain(expectedMessage)
      return
    }
    throw error
  }
  throw new Error(`expected rejection containing: ${expectedMessage}`)
}

async function writeManifestFile(
  rootDir: string,
  candidateFile: string,
  candidateId: string,
): Promise<void> {
  const manifest: ProposalManifest = {
    candidates: [
      {
        candidateId,
        file: candidateFile,
        kind: "supervisor_rule",
        status: "proposed",
      },
    ],
    generatedAt: "2026-06-15T00:00:00.000Z",
    schemaVersion: 1,
    traceDir: fixtureTraceDir,
    traceRunId: "fake-run",
  }
  await writeFile(join(rootDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
}

async function writeCandidateFile(path: string, candidateId: string): Promise<void> {
  const candidate: ProposalCandidate = {
    candidateId,
    createdAt: "2026-06-15T00:00:00.000Z",
    evidence: [`${fixtureTraceDir}/events.jsonl`],
    kind: "supervisor_rule",
    rationale: "valid external candidate used to prove path traversal is not read",
    rollbackNotes: "Delete this external candidate file.",
    schemaVersion: 1,
    status: "proposed",
    title: "External proposal candidate",
    traceRunId: "fake-run",
  }
  await writeFile(path, `${JSON.stringify(candidate, null, 2)}\n`, "utf8")
}
