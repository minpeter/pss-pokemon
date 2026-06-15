import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { loadTraceReportData } from "./trace-report"
import { renderTraceReportHtml } from "./trace-viewer-html"
import { parseTraceViewerArgs } from "./trace-viewer-main"

const fixtureTraceDir = join(import.meta.dir, "../test-fixtures/traces/fake-run")

describe("trace viewer report", () => {
  test("loads a sample trace into renderable report data", async () => {
    const report = await loadTraceReportData(fixtureTraceDir)

    expect(report.run.runId).toBe("fake-run")
    expect(report.run.metadata.backendKind).toBe("pyboy_fake")
    expect(report.replay?.metadata.objectiveId).toBe("redblue.pallet_fake_smoke")
    expect(report.actions).toHaveLength(2)
    expect(report.observations).toHaveLength(2)
    expect(report.metrics.totalActions).toBe(2)
    expect(report.objectiveResults.at(0)).toEqual(
      expect.objectContaining({
        objectiveId: "redblue.pallet_fake_smoke",
        status: "in_progress",
      }),
    )
    expect(report.screenshotMetadata.at(0)).toEqual(
      expect.objectContaining({
        kind: "screenshot",
        pngBase64Length: 4,
      }),
    )
  })

  test("renders the inspection UI sections without making benchmark claims", async () => {
    const report = await loadTraceReportData(fixtureTraceDir)
    const html = renderTraceReportHtml(report)

    expect(html).toContain("fake-run")
    expect(html).toContain("Action timeline")
    expect(html).toContain("Objective status")
    expect(html).toContain("Screenshot metadata")
    expect(html).toContain("inspection UX")
    expect(html).toContain("Benchmark authority remains")
  })

  test("parses server arguments and rejects missing input", () => {
    expect(
      parseTraceViewerArgs([
        "--input",
        "test-fixtures/traces/fake-run",
        "--host",
        "127.0.0.1",
        "--port",
        "8899",
      ]),
    ).toEqual({
      host: "127.0.0.1",
      port: 8899,
      traceDir: "test-fixtures/traces/fake-run",
    })
    expect(() => parseTraceViewerArgs(["--port", "8899"])).toThrow()
    expect(() => parseTraceViewerArgs(["--input", "run", "--port", "bad"])).toThrow()
  })
})
