import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { loadTraceReportData } from "./trace-report"

export const ProposalKindSchema = z.enum([
  "prompt_patch",
  "supervisor_rule",
  "micro_controller_fix",
  "world_model_update",
])

const PROPOSAL_CANDIDATE_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u

export const ProposalCandidateFileSchema = z
  .string()
  .min(1)
  .regex(
    PROPOSAL_CANDIDATE_FILE_PATTERN,
    "candidate file must be a safe relative filename ending in .json",
  )

export const ProposalCandidateSchema = z
  .object({
    candidateId: z.string().min(1),
    createdAt: z.string().min(1),
    evidence: z.array(z.string().min(1)).min(1),
    kind: ProposalKindSchema,
    rationale: z.string().min(1),
    rollbackNotes: z.string().min(1),
    schemaVersion: z.literal(1),
    status: z.literal("proposed"),
    title: z.string().min(1),
    traceRunId: z.string().min(1),
  })
  .strict()

export const ProposalManifestSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            candidateId: z.string().min(1),
            file: ProposalCandidateFileSchema,
            kind: ProposalKindSchema,
            status: z.literal("proposed"),
          })
          .strict(),
      )
      .min(1),
    generatedAt: z.string().min(1),
    schemaVersion: z.literal(1),
    traceDir: z.string().min(1),
    traceRunId: z.string().min(1),
  })
  .strict()

export type ProposalCandidate = z.infer<typeof ProposalCandidateSchema>
export type ProposalManifest = z.infer<typeof ProposalManifestSchema>

export type GenerateImprovementProposalsOptions = {
  readonly clock?: () => Date
  readonly outputDir: string
  readonly traceDir: string
}

export async function generateImprovementProposals({
  clock = () => new Date(),
  outputDir,
  traceDir,
}: GenerateImprovementProposalsOptions): Promise<ProposalManifest> {
  const report = await loadTraceReportData(traceDir)
  const createdAt = clock().toISOString()
  const candidates = buildCandidates({ createdAt, traceDir, traceRunId: report.run.runId })
  await mkdir(outputDir, { recursive: true })
  const manifestCandidates = await Promise.all(
    candidates.map(async (candidate, index) => {
      const file = `candidate-${String(index + 1).padStart(3, "0")}.json`
      await writeJson(join(outputDir, file), candidate)
      return {
        candidateId: candidate.candidateId,
        file,
        kind: candidate.kind,
        status: candidate.status,
      }
    }),
  )
  const manifest = ProposalManifestSchema.parse({
    candidates: manifestCandidates,
    generatedAt: createdAt,
    schemaVersion: 1,
    traceDir,
    traceRunId: report.run.runId,
  })
  await writeJson(join(outputDir, "manifest.json"), manifest)
  return manifest
}

function buildCandidates({
  createdAt,
  traceDir,
  traceRunId,
}: {
  readonly createdAt: string
  readonly traceDir: string
  readonly traceRunId: string
}): readonly ProposalCandidate[] {
  return [
    createCandidate({
      candidateId: "proposal-001",
      createdAt,
      evidence: [
        `${traceDir}/actions.jsonl`,
        `${traceDir}/observations.jsonl`,
        `${traceDir}/events.jsonl`,
      ],
      kind: "micro_controller_fix",
      rationale:
        "Review repeated action and observation windows before changing navigation or recovery code.",
      title: "Review trace-local controller recovery opportunities",
      traceRunId,
    }),
    createCandidate({
      candidateId: "proposal-002",
      createdAt,
      evidence: [`${traceDir}/run.json`, `${traceDir}/events.jsonl`],
      kind: "supervisor_rule",
      rationale:
        "Consider a bounded supervisor rule only after a human reviews the evidence and regression risk.",
      title: "Evaluate supervised action rule candidate",
      traceRunId,
    }),
  ]
}

function createCandidate({
  candidateId,
  createdAt,
  evidence,
  kind,
  rationale,
  title,
  traceRunId,
}: Omit<ProposalCandidate, "rollbackNotes" | "schemaVersion" | "status">): ProposalCandidate {
  return ProposalCandidateSchema.parse({
    candidateId,
    createdAt,
    evidence,
    kind,
    rationale,
    rollbackNotes:
      "No active harness file is changed by this proposal. Delete the candidate and review log to roll back the artifact.",
    schemaVersion: 1,
    status: "proposed",
    title,
    traceRunId,
  })
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}
