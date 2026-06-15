import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseTraceCorpusArgs, runTraceCorpusCli } from "./trace-corpus-main"
import { validateTraceCorpusPath } from "./trace-corpus-validator"

const fixtureTraceDir = join(import.meta.dir, "../test-fixtures/traces/fake-run")

describe("trace corpus workflow", () => {
  test("accepts the fake trace fixture as shareable corpus input", async () => {
    const result = await validateTraceCorpusPath(fixtureTraceDir)

    expect(result.ok).toBe(true)
    expect(result.inspectedFiles).toBeGreaterThan(0)
    expect(result.violations).toEqual([])
  })

  test("rejects secrets, ROM paths, save-state references, and artifact files", async () => {
    const corpusDir = await mkdtemp(join(tmpdir(), "pokemon-corpus-bad-"))
    await writeFile(
      join(corpusDir, "run.json"),
      JSON.stringify({
        apiKey: "POKEMON_AI_API_KEY=sk-untrusted-secret",
        romPath: "/Users/example/roms/red.gb",
        saveState: "pallet.state",
      }),
      "utf8",
    )
    await writeFile(join(corpusDir, "red.sav"), "not shareable", "utf8")

    const result = await validateTraceCorpusPath(corpusDir)

    expect(result.ok).toBe(false)
    expect(result.violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining([
        "absolute_rom_path",
        "forbidden_artifact_file",
        "forbidden_artifact_reference",
        "secret_reference",
      ]),
    )
  })

  test("rejects run files without schema-owned harness metadata", async () => {
    const corpusDir = await mkdtemp(join(tmpdir(), "pokemon-corpus-metadata-"))
    await writeFile(
      join(corpusDir, "run.json"),
      JSON.stringify({
        abiVersion: "pss-pokemon.trace.v1",
        metadata: {
          backendKind: "fake",
          romIdentity: "none",
        },
        runId: "bad-run",
        schemaVersion: 1,
        timestamp: "2026-06-15T00:00:00.000Z",
        type: "run",
      }),
      "utf8",
    )

    const result = await validateTraceCorpusPath(corpusDir)

    expect(result.ok).toBe(false)
    expect(result.violations.map((violation) => violation.code)).toContain("invalid_trace_metadata")
  })

  test("rejects hidden secret and artifact files", async () => {
    const corpusDir = await mkdtemp(join(tmpdir(), "pokemon-corpus-hidden-"))
    await writeFile(
      join(corpusDir, ".secrets.json"),
      JSON.stringify({ token: "OPENAI_API_KEY=sk-hidden-secret123" }),
      "utf8",
    )
    await writeFile(join(corpusDir, ".hidden.sav"), "not shareable", "utf8")

    const result = await validateTraceCorpusPath(corpusDir)

    expect(result.ok).toBe(false)
    expect(result.violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining(["forbidden_artifact_file", "secret_reference"]),
    )
    expect(result.violations.map((violation) => violation.file)).toEqual(
      expect.arrayContaining([".hidden.sav", ".secrets.json"]),
    )
  })

  test("rejects oversized inline screenshots unless explicitly local-only", async () => {
    const corpusDir = await mkdtemp(join(tmpdir(), "pokemon-corpus-screenshot-"))
    await writeFile(
      join(corpusDir, "observations.jsonl"),
      `${JSON.stringify({ screenshot: { pngBase64: "A".repeat(4096) } })}\n`,
      "utf8",
    )

    expect((await validateTraceCorpusPath(corpusDir)).violations.at(0)?.code).toBe(
      "inline_screenshot",
    )
    expect(
      await validateTraceCorpusPath(corpusDir, { allowLocalOnlyScreenshots: true }),
    ).toMatchObject({ ok: true })
  })

  test("keeps local-only screenshot relaxation from hiding dotfile secrets", async () => {
    const corpusDir = await mkdtemp(join(tmpdir(), "pokemon-corpus-local-hidden-"))
    await writeFile(join(corpusDir, ".local-only"), "", "utf8")
    await writeFile(
      join(corpusDir, "observations.jsonl"),
      `${JSON.stringify({ screenshot: { pngBase64: "A".repeat(4096) } })}\n`,
      "utf8",
    )
    await writeFile(
      join(corpusDir, ".secrets.json"),
      JSON.stringify({ token: "AI_API_KEY=sk-local-hidden-secret" }),
      "utf8",
    )
    await writeFile(join(corpusDir, ".hidden.state"), "not shareable", "utf8")

    const result = await validateTraceCorpusPath(corpusDir)

    expect(result.ok).toBe(false)
    expect(result.violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining(["forbidden_artifact_file", "secret_reference"]),
    )
    expect(result.violations.map((violation) => violation.code)).not.toContain("inline_screenshot")
  })

  test("writes validation and comparison JSON through the CLI", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pokemon-corpus-cli-"))
    const validationPath = join(outputDir, "validation.json")
    const diffPath = join(outputDir, "diff.json")

    await runTraceCorpusCli(["validate", "--input", fixtureTraceDir, "--output", validationPath])
    await runTraceCorpusCli([
      "compare",
      "--left",
      fixtureTraceDir,
      "--right",
      fixtureTraceDir,
      "--output",
      diffPath,
    ])

    expect(JSON.parse(await readFile(validationPath, "utf8"))).toMatchObject({ ok: true })
    expect(JSON.parse(await readFile(diffPath, "utf8")).diff).toMatchObject({
      actionDelta: 0,
      observationDelta: 0,
    })
  })

  test("parses commands and rejects incomplete calls", () => {
    expect(parseTraceCorpusArgs(["validate", "--input", "run"])).toMatchObject({
      inputPath: "run",
      type: "validate",
    })
    expect(() => parseTraceCorpusArgs([])).toThrow()
    expect(() => parseTraceCorpusArgs(["compare", "--left", "a"])).toThrow()
  })
})
