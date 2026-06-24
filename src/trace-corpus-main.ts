import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { validateTraceCorpusPath } from "./trace-corpus-validator"
import { loadTraceReportData } from "./trace-report"

type TraceCorpusCommand =
  | {
      readonly allowLocalOnlyScreenshots: boolean
      readonly inputPath: string
      readonly outputPath?: string
      readonly type: "validate"
    }
  | {
      readonly leftTraceDir: string
      readonly outputPath: string
      readonly rightTraceDir: string
      readonly type: "compare"
    }

export async function runTraceCorpusCli(argv: readonly string[]): Promise<void> {
  const command = parseTraceCorpusArgs(argv)
  switch (command.type) {
    case "compare":
      await writeJson(command.outputPath, await compareTraceDirs(command))
      return
    case "validate": {
      const result = await validateTraceCorpusPath(command.inputPath, {
        allowLocalOnlyScreenshots: command.allowLocalOnlyScreenshots,
      })
      if (command.outputPath === undefined) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        await writeJson(command.outputPath, result)
      }
      if (!result.ok) {
        process.exitCode = 1
      }
      return
    }
    default:
      assertNever(command)
  }
}

export function parseTraceCorpusArgs(argv: readonly string[]): TraceCorpusCommand {
  const command = argv[0]
  if (command === "validate") {
    return parseValidateArgs(argv.slice(1))
  }
  if (command === "compare") {
    return parseCompareArgs(argv.slice(1))
  }
  throw new MissingTraceCorpusCommandError()
}

async function compareTraceDirs(command: Extract<TraceCorpusCommand, { type: "compare" }>) {
  const report = await loadTraceReportData(command.leftTraceDir, {
    compareTraceDir: command.rightTraceDir,
  })
  return {
    diff: report.diff,
    leftRunId: report.run.runId,
    rightTraceDir: command.rightTraceDir,
  }
}

function parseValidateArgs(
  argv: readonly string[],
): Extract<TraceCorpusCommand, { type: "validate" }> {
  let allowLocalOnlyScreenshots = false
  let inputPath: string | undefined
  let outputPath: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    switch (token) {
      case "--allow-local-only-screenshots":
        allowLocalOnlyScreenshots = true
        break
      case "--input":
        inputPath = requireArgValue(argv, index, token)
        index += 1
        break
      case "--output":
        outputPath = requireArgValue(argv, index, token)
        index += 1
        break
      default:
        throw new UnsupportedTraceCorpusArgumentError(token ?? "")
    }
  }
  if (inputPath === undefined) {
    throw new MissingTraceCorpusInputError("validate")
  }
  return {
    allowLocalOnlyScreenshots,
    inputPath,
    ...(outputPath === undefined ? {} : { outputPath }),
    type: "validate",
  }
}

function parseCompareArgs(
  argv: readonly string[],
): Extract<TraceCorpusCommand, { type: "compare" }> {
  let leftTraceDir: string | undefined
  let outputPath: string | undefined
  let rightTraceDir: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    switch (token) {
      case "--left":
        leftTraceDir = requireArgValue(argv, index, token)
        index += 1
        break
      case "--output":
        outputPath = requireArgValue(argv, index, token)
        index += 1
        break
      case "--right":
        rightTraceDir = requireArgValue(argv, index, token)
        index += 1
        break
      default:
        throw new UnsupportedTraceCorpusArgumentError(token ?? "")
    }
  }
  if (leftTraceDir === undefined || rightTraceDir === undefined || outputPath === undefined) {
    throw new MissingTraceCorpusInputError("compare")
  }
  return { leftTraceDir, outputPath, rightTraceDir, type: "compare" }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function requireArgValue(argv: readonly string[], index: number, token: string): string {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new MissingTraceCorpusArgumentValueError(token)
  }
  return value
}

function assertNever(value: never): never {
  throw new Error(`unreachable trace corpus command: ${JSON.stringify(value)}`)
}

class MissingTraceCorpusCommandError extends Error {
  readonly name = "MissingTraceCorpusCommandError"

  constructor() {
    super("trace-corpus requires validate or compare")
  }
}

class MissingTraceCorpusInputError extends Error {
  readonly name = "MissingTraceCorpusInputError"

  constructor(readonly command: string) {
    super(`trace-corpus ${command} is missing required paths`)
  }
}

class UnsupportedTraceCorpusArgumentError extends Error {
  readonly name = "UnsupportedTraceCorpusArgumentError"

  constructor(readonly argument: string) {
    super(`unsupported trace-corpus argument ${argument}`)
  }
}

class MissingTraceCorpusArgumentValueError extends Error {
  readonly name = "MissingTraceCorpusArgumentValueError"

  constructor(readonly argument: string) {
    super(`missing value for trace-corpus argument ${argument}`)
  }
}

if (import.meta.main) {
  await runTraceCorpusCli(Bun.argv.slice(2))
}
