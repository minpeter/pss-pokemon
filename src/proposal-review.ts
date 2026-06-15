import { appendFile, readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { ProposalCandidateSchema, ProposalManifestSchema } from "./proposal-engine"

export const ProposalReviewStatusSchema = z.enum(["approved", "rejected"])

export const ProposalReviewRecordSchema = z
  .object({
    action: z.literal("review_recorded_no_mutation"),
    candidateId: z.string().min(1),
    note: z.string().min(1),
    reviewedAt: z.string().min(1),
    reviewer: z.string().min(1),
    reviewId: z.string().min(1),
    status: ProposalReviewStatusSchema,
  })
  .strict()

export type ProposalReviewRecord = z.infer<typeof ProposalReviewRecordSchema>
export type ProposalReviewStatus = z.infer<typeof ProposalReviewStatusSchema>

export async function listProposalCandidates(rootDir: string) {
  const manifest = await readManifest(rootDir)
  return Promise.all(
    manifest.candidates.map(async (entry) => ({
      ...entry,
      candidate: ProposalCandidateSchema.parse(
        JSON.parse(await readFile(join(rootDir, entry.file), "utf8")),
      ),
    })),
  )
}

export async function showProposalCandidate(rootDir: string, candidateId: string) {
  const candidates = await listProposalCandidates(rootDir)
  const match = candidates.find((entry) => entry.candidateId === candidateId)
  if (match === undefined) {
    throw new UnknownProposalCandidateError(candidateId)
  }
  return match.candidate
}

export async function recordProposalReview({
  candidateId,
  clock = () => new Date(),
  note,
  reviewer,
  rootDir,
  status,
}: {
  readonly candidateId: string
  readonly clock?: () => Date
  readonly note: string
  readonly reviewer: string
  readonly rootDir: string
  readonly status: ProposalReviewStatus
}): Promise<ProposalReviewRecord> {
  await showProposalCandidate(rootDir, candidateId)
  const reviewedAt = clock().toISOString()
  const record = ProposalReviewRecordSchema.parse({
    action: "review_recorded_no_mutation",
    candidateId,
    note,
    reviewedAt,
    reviewer,
    reviewId: `review-${reviewedAt.replace(/[^0-9A-Za-z]+/g, "-")}-${candidateId}`,
    status,
  })
  await appendFile(join(rootDir, "reviews.jsonl"), `${JSON.stringify(record)}\n`, "utf8")
  return record
}

async function readManifest(rootDir: string) {
  return ProposalManifestSchema.parse(
    JSON.parse(await readFile(join(rootDir, "manifest.json"), "utf8")),
  )
}

export class UnknownProposalCandidateError extends Error {
  readonly name = "UnknownProposalCandidateError"

  constructor(readonly candidateId: string) {
    super(`unknown proposal candidate: ${candidateId}`)
  }
}
