import { loadTraceReportData } from "./trace-report"
import { renderTraceReportHtml } from "./trace-viewer-html"

export type TraceViewerArgs = {
  readonly compareTraceDir?: string
  readonly host: string
  readonly port: number
  readonly traceDir: string
}

export function parseTraceViewerArgs(argv: readonly string[]): TraceViewerArgs {
  let compareTraceDir: string | undefined
  let host = "127.0.0.1"
  let port = 8899
  let traceDir: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    switch (token) {
      case "--compare":
        compareTraceDir = requireArgValue(argv, index, token)
        index += 1
        break
      case "--host":
        host = requireArgValue(argv, index, token)
        index += 1
        break
      case "--input":
        traceDir = requireArgValue(argv, index, token)
        index += 1
        break
      case "--port":
        port = parsePort(requireArgValue(argv, index, token))
        index += 1
        break
      default:
        throw new UnsupportedTraceViewerArgumentError(token ?? "")
    }
  }
  if (traceDir === undefined) {
    throw new MissingTraceViewerInputError()
  }
  return {
    ...(compareTraceDir === undefined ? {} : { compareTraceDir }),
    host,
    port,
    traceDir,
  }
}

export async function createTraceViewerResponse(
  args: TraceViewerArgs,
  request: Request,
): Promise<Response> {
  const report = await loadTraceReportData(args.traceDir, {
    ...(args.compareTraceDir === undefined ? {} : { compareTraceDir: args.compareTraceDir }),
  })
  const url = new URL(request.url)
  if (url.pathname === "/api/report") {
    return Response.json(report)
  }
  return new Response(renderTraceReportHtml(report), {
    headers: { "content-type": "text/html; charset=utf-8" },
  })
}

export async function runTraceViewerCli(argv: readonly string[]): Promise<void> {
  const args = parseTraceViewerArgs(argv)
  const server = Bun.serve({
    fetch: (request) => createTraceViewerResponse(args, request),
    hostname: args.host,
    port: args.port,
  })
  console.log(`trace viewer listening on http://${server.hostname}:${server.port}`)
  await new Promise<never>(() => {})
}

function parsePort(value: string): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidTraceViewerPortError(value)
  }
  return port
}

function requireArgValue(argv: readonly string[], index: number, token: string): string {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new MissingTraceViewerArgumentValueError(token)
  }
  return value
}

class MissingTraceViewerInputError extends Error {
  readonly name = "MissingTraceViewerInputError"

  constructor() {
    super("trace-viewer requires --input <trace-run-dir>")
  }
}

class UnsupportedTraceViewerArgumentError extends Error {
  readonly name = "UnsupportedTraceViewerArgumentError"

  constructor(readonly argument: string) {
    super(`unsupported trace-viewer argument ${argument}`)
  }
}

class MissingTraceViewerArgumentValueError extends Error {
  readonly name = "MissingTraceViewerArgumentValueError"

  constructor(readonly argument: string) {
    super(`missing value for trace-viewer argument ${argument}`)
  }
}

class InvalidTraceViewerPortError extends Error {
  readonly name = "InvalidTraceViewerPortError"

  constructor(readonly port: string) {
    super(`invalid trace-viewer port ${port}`)
  }
}

if (import.meta.main) {
  await runTraceViewerCli(Bun.argv.slice(2))
}
