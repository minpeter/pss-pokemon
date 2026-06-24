import { generateImprovementProposals } from "./proposal-engine"

type ImproveArgs = {
  readonly outputDir: string
  readonly traceDir: string
}

export async function runImproveCli(argv: readonly string[]): Promise<void> {
  const args = parseImproveArgs(argv)
  const manifest = await generateImprovementProposals({
    outputDir: args.outputDir,
    traceDir: args.traceDir,
  })
  console.log(JSON.stringify(manifest, null, 2))
}

export function parseImproveArgs(argv: readonly string[]): ImproveArgs {
  let outputDir: string | undefined
  let traceDir: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    switch (token) {
      case "--output":
        outputDir = requireArgValue(argv, index, token)
        index += 1
        break
      case "--trace":
        traceDir = requireArgValue(argv, index, token)
        index += 1
        break
      default:
        throw new UnsupportedImproveArgumentError(token ?? "")
    }
  }
  if (traceDir === undefined || outputDir === undefined) {
    throw new MissingImproveArgumentError()
  }
  return { outputDir, traceDir }
}

function requireArgValue(argv: readonly string[], index: number, token: string): string {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new MissingImproveArgumentValueError(token)
  }
  return value
}

class MissingImproveArgumentError extends Error {
  readonly name = "MissingImproveArgumentError"

  constructor() {
    super("improve requires --trace <trace-dir> and --output <proposal-dir>")
  }
}

class UnsupportedImproveArgumentError extends Error {
  readonly name = "UnsupportedImproveArgumentError"

  constructor(readonly argument: string) {
    super(`unsupported improve argument ${argument}`)
  }
}

class MissingImproveArgumentValueError extends Error {
  readonly name = "MissingImproveArgumentValueError"

  constructor(readonly argument: string) {
    super(`missing value for improve argument ${argument}`)
  }
}

if (import.meta.main) {
  await runImproveCli(Bun.argv.slice(2))
}
