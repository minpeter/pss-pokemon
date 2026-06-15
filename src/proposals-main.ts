import {
  listProposalCandidates,
  type ProposalReviewStatus,
  ProposalReviewStatusSchema,
  recordProposalReview,
  showProposalCandidate,
} from "./proposal-review"

type ProposalsArgs =
  | { readonly rootDir: string; readonly type: "list" }
  | { readonly candidateId: string; readonly rootDir: string; readonly type: "show" }
  | {
      readonly candidateId: string
      readonly note: string
      readonly reviewer: string
      readonly rootDir: string
      readonly status: ProposalReviewStatus
      readonly type: "review"
    }

export async function runProposalsCli(argv: readonly string[]): Promise<void> {
  const args = parseProposalsArgs(argv)
  switch (args.type) {
    case "list":
      console.log(JSON.stringify(await listProposalCandidates(args.rootDir), null, 2))
      return
    case "review":
      console.log(JSON.stringify(await recordProposalReview(args), null, 2))
      return
    case "show":
      console.log(
        JSON.stringify(await showProposalCandidate(args.rootDir, args.candidateId), null, 2),
      )
      return
    default:
      assertNever(args)
  }
}

export function parseProposalsArgs(argv: readonly string[]): ProposalsArgs {
  const command = argv[0]
  if (command === "list") {
    return parseListArgs(argv.slice(1))
  }
  if (command === "review") {
    return parseReviewArgs(argv.slice(1))
  }
  if (command === "show") {
    return parseShowArgs(argv.slice(1))
  }
  throw new UnsupportedProposalsCommandError(command ?? "")
}

function parseListArgs(argv: readonly string[]): Extract<ProposalsArgs, { type: "list" }> {
  return { rootDir: parseRootOnly(argv), type: "list" }
}

function parseShowArgs(argv: readonly string[]): Extract<ProposalsArgs, { type: "show" }> {
  const { candidateId, rootDir } = parseCandidateArgs(argv)
  return { candidateId, rootDir, type: "show" }
}

function parseReviewArgs(argv: readonly string[]): Extract<ProposalsArgs, { type: "review" }> {
  let note: string | undefined
  let reviewer: string | undefined
  let status: ProposalReviewStatus | undefined
  const { candidateId, rootDir } = parseCandidateArgs(argv, (token, value) => {
    switch (token) {
      case "--note":
        note = value
        return true
      case "--reviewer":
        reviewer = value
        return true
      case "--status":
        status = ProposalReviewStatusSchema.parse(value)
        return true
      default:
        return false
    }
  })
  if (note === undefined || reviewer === undefined || status === undefined) {
    throw new MissingProposalsArgumentError("review requires --status, --reviewer, and --note")
  }
  return { candidateId, note, reviewer, rootDir, status, type: "review" }
}

function parseRootOnly(argv: readonly string[]): string {
  let rootDir: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token !== "--root") {
      throw new UnsupportedProposalsArgumentError(token ?? "")
    }
    rootDir = requireArgValue(argv, index, token)
    index += 1
  }
  if (rootDir === undefined) {
    throw new MissingProposalsArgumentError("missing --root")
  }
  return rootDir
}

function parseCandidateArgs(
  argv: readonly string[],
  consumeExtra?: (token: string, value: string) => boolean,
): { readonly candidateId: string; readonly rootDir: string } {
  let candidateId: string | undefined
  let rootDir: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const value = requireArgValue(argv, index, token ?? "")
    if (token === "--candidate") {
      candidateId = value
    } else if (token === "--root") {
      rootDir = value
    } else if (token === undefined || consumeExtra?.(token, value) !== true) {
      throw new UnsupportedProposalsArgumentError(token ?? "")
    }
    index += 1
  }
  if (candidateId === undefined || rootDir === undefined) {
    throw new MissingProposalsArgumentError("missing --root or --candidate")
  }
  return { candidateId, rootDir }
}

function requireArgValue(argv: readonly string[], index: number, token: string): string {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new MissingProposalsArgumentValueError(token)
  }
  return value
}

function assertNever(value: never): never {
  throw new Error(`unreachable proposals command: ${JSON.stringify(value)}`)
}

class UnsupportedProposalsCommandError extends Error {
  readonly name = "UnsupportedProposalsCommandError"
}

class UnsupportedProposalsArgumentError extends Error {
  readonly name = "UnsupportedProposalsArgumentError"
}

class MissingProposalsArgumentError extends Error {
  readonly name = "MissingProposalsArgumentError"
}

class MissingProposalsArgumentValueError extends Error {
  readonly name = "MissingProposalsArgumentValueError"
}

if (import.meta.main) {
  await runProposalsCli(Bun.argv.slice(2))
}
