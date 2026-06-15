import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { computeActionQualityMetricsFromTraceDir } from "./action-quality-metrics"

type EvalMetricsArgs = {
  readonly outputPath: string
  readonly traceDir: string
}

export async function runEvalMetricsCli(argv: readonly string[]): Promise<void> {
  const args = parseEvalMetricsArgs(argv)
  const metrics = await computeActionQualityMetricsFromTraceDir(args.traceDir)
  await mkdir(dirname(args.outputPath), { recursive: true })
  await writeFile(args.outputPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8")
}

export function parseEvalMetricsArgs(argv: readonly string[]): EvalMetricsArgs {
  let outputPath: string | undefined
  let traceDir: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    switch (token) {
      case "--trace":
        traceDir = requireArgValue(argv, index, token)
        index += 1
        break
      case "--output":
        outputPath = requireArgValue(argv, index, token)
        index += 1
        break
      default:
        throw new UnsupportedEvalMetricsArgumentError(token ?? "")
    }
  }
  if (traceDir === undefined || outputPath === undefined) {
    throw new MissingEvalMetricsArgumentError()
  }
  return { outputPath, traceDir }
}

class MissingEvalMetricsArgumentError extends Error {
  readonly name = "MissingEvalMetricsArgumentError"

  constructor() {
    super("eval-metrics requires --trace <dir> and --output <file>")
  }
}

class UnsupportedEvalMetricsArgumentError extends Error {
  readonly name = "UnsupportedEvalMetricsArgumentError"

  constructor(readonly argument: string) {
    super(`unsupported eval-metrics argument ${argument}`)
  }
}

class MissingEvalMetricsArgumentValueError extends Error {
  readonly name = "MissingEvalMetricsArgumentValueError"

  constructor(readonly argument: string) {
    super(`missing value for eval-metrics argument ${argument}`)
  }
}

function requireArgValue(argv: readonly string[], index: number, token: string): string {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new MissingEvalMetricsArgumentValueError(token)
  }
  return value
}

if (import.meta.main) {
  await runEvalMetricsCli(Bun.argv.slice(2))
}
