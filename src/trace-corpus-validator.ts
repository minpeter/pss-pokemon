import { readdir, readFile, stat } from "node:fs/promises"
import { basename, join, relative } from "node:path"
import { z } from "zod"
import { TraceReplaySchema } from "./trace-replay"
import { TraceRunFileSchema } from "./trace-run-metadata"

const DEFAULT_MAX_INLINE_SCREENSHOT_BYTES = 2048

const FORBIDDEN_ARTIFACT_PATTERN = /\.(gb|gbc|sav|state)(?:$|["'\s)])/i
const SECRET_PATTERN =
  /\b(POKEMON_AI_API_KEY|AI_API_KEY|OPENAI_API_KEY)\b\s*[:=]\s*["']?[^"'\s]+|sk-[A-Za-z0-9_-]{12,}/
const ABSOLUTE_ROM_PATH_PATTERN =
  /(?:\/[A-Za-z0-9._ -]+)+\.(?:gb|gbc|sav|state)\b|[A-Za-z]:\\[^"'\n]+\\[^"'\n]+\.(?:gb|gbc|sav|state)\b/i

export const TraceCorpusViolationSchema = z
  .object({
    code: z.enum([
      "absolute_rom_path",
      "forbidden_artifact_reference",
      "forbidden_artifact_file",
      "invalid_trace_metadata",
      "invalid_trace_replay",
      "inline_screenshot",
      "secret_reference",
    ]),
    detail: z.string().min(1),
    file: z.string().min(1),
  })
  .strict()

export const TraceCorpusValidationResultSchema = z
  .object({
    inputPath: z.string().min(1),
    inspectedFiles: z.number().int().min(0),
    ok: z.boolean(),
    violations: z.array(TraceCorpusViolationSchema),
  })
  .strict()

export type TraceCorpusViolation = z.infer<typeof TraceCorpusViolationSchema>
export type TraceCorpusValidationResult = z.infer<typeof TraceCorpusValidationResultSchema>

export type TraceCorpusValidationOptions = {
  readonly allowLocalOnlyScreenshots?: boolean
  readonly maxInlineScreenshotBytes?: number
}

export async function validateTraceCorpusPath(
  inputPath: string,
  options: TraceCorpusValidationOptions = {},
): Promise<TraceCorpusValidationResult> {
  const files = await listFiles(inputPath)
  const allowInlineScreenshots =
    options.allowLocalOnlyScreenshots === true ||
    (await Bun.file(join(inputPath, ".local-only")).exists())
  const maxInlineScreenshotBytes =
    options.maxInlineScreenshotBytes ?? DEFAULT_MAX_INLINE_SCREENSHOT_BYTES
  const violations = (
    await Promise.all(
      files.map((file) =>
        inspectTraceCorpusFile({
          allowInlineScreenshots,
          file,
          inputPath,
          maxInlineScreenshotBytes,
        }),
      ),
    )
  ).flat()

  return TraceCorpusValidationResultSchema.parse({
    inputPath,
    inspectedFiles: files.length,
    ok: violations.length === 0,
    violations,
  })
}

async function inspectTraceCorpusFile({
  allowInlineScreenshots,
  file,
  inputPath,
  maxInlineScreenshotBytes,
}: {
  readonly allowInlineScreenshots: boolean
  readonly file: string
  readonly inputPath: string
  readonly maxInlineScreenshotBytes: number
}): Promise<readonly TraceCorpusViolation[]> {
  const relativeFile = relative(inputPath, file)
  const violations: TraceCorpusViolation[] = []
  if (FORBIDDEN_ARTIFACT_PATTERN.test(basename(file))) {
    violations.push(violation("forbidden_artifact_file", relativeFile, "ROM/save artifact file"))
  }
  const text = await readFile(file, "utf8")
  collectTextViolations({ file: relativeFile, text, violations })
  collectTraceSchemaViolations({ file: relativeFile, text, violations })
  if (!allowInlineScreenshots) {
    collectInlineScreenshotViolations({
      file: relativeFile,
      maxInlineScreenshotBytes,
      text,
      violations,
    })
  }
  return violations
}

function collectTraceSchemaViolations({
  file,
  text,
  violations,
}: {
  readonly file: string
  readonly text: string
  readonly violations: TraceCorpusViolation[]
}): void {
  switch (file) {
    case "run.json":
      collectSchemaViolation({
        code: "invalid_trace_metadata",
        detail: "run metadata does not match HarnessRunMetadataSchema",
        file,
        schema: TraceRunFileSchema,
        text,
        violations,
      })
      return
    case "replay.json":
      collectSchemaViolation({
        code: "invalid_trace_replay",
        detail: "replay record does not match TraceReplaySchema",
        file,
        schema: TraceReplaySchema,
        text,
        violations,
      })
      return
    default:
      return
  }
}

function collectSchemaViolation<Schema extends z.ZodType>({
  code,
  detail,
  file,
  schema,
  text,
  violations,
}: {
  readonly code: TraceCorpusViolation["code"]
  readonly detail: string
  readonly file: string
  readonly schema: Schema
  readonly text: string
  readonly violations: TraceCorpusViolation[]
}): void {
  const parsed = parseJson(text)
  if (parsed === null || !schema.safeParse(parsed).success) {
    violations.push(violation(code, file, detail))
  }
}

function collectTextViolations({
  file,
  text,
  violations,
}: {
  readonly file: string
  readonly text: string
  readonly violations: TraceCorpusViolation[]
}): void {
  if (SECRET_PATTERN.test(text)) {
    violations.push(violation("secret_reference", file, "API key or secret-like token"))
  }
  if (ABSOLUTE_ROM_PATH_PATTERN.test(text)) {
    violations.push(violation("absolute_rom_path", file, "absolute ROM/save path"))
  }
  if (FORBIDDEN_ARTIFACT_PATTERN.test(text)) {
    violations.push(violation("forbidden_artifact_reference", file, "ROM/save extension reference"))
  }
}

function collectInlineScreenshotViolations({
  file,
  maxInlineScreenshotBytes,
  text,
  violations,
}: {
  readonly file: string
  readonly maxInlineScreenshotBytes: number
  readonly text: string
  readonly violations: TraceCorpusViolation[]
}): void {
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) {
      continue
    }
    const parsed = parseJson(line)
    if (parsed !== null) {
      findOversizedScreenshots(parsed, maxInlineScreenshotBytes).forEach((length) => {
        violations.push(violation("inline_screenshot", file, `inline pngBase64 length ${length}`))
      })
    }
  }
}

function findOversizedScreenshots(value: unknown, maxBytes: number): readonly number[] {
  if (Array.isArray(value)) {
    return value.flatMap((child) => findOversizedScreenshots(child, maxBytes))
  }
  if (value === null || typeof value !== "object") {
    return []
  }
  return Object.entries(value).flatMap(([key, child]) => {
    if (key === "pngBase64" && typeof child === "string" && child.length > maxBytes) {
      return [child.length]
    }
    return findOversizedScreenshots(child, maxBytes)
  })
}

async function listFiles(inputPath: string): Promise<readonly string[]> {
  const inputStat = await stat(inputPath)
  if (inputStat.isFile()) {
    return [inputPath]
  }
  const entries = await readdir(inputPath, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(inputPath, entry.name)
      return entry.isDirectory() ? listFiles(path) : [path]
    }),
  )
  return nested.flat().sort((left, right) => left.localeCompare(right))
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function violation(
  code: TraceCorpusViolation["code"],
  file: string,
  detail: string,
): TraceCorpusViolation {
  return { code, detail, file }
}
