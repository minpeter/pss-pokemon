import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ActionQualityMetricsSchema,
  computeActionQualityMetricsFromTraceDir,
} from "./action-quality-metrics"
import { parseEvalMetricsArgs, runEvalMetricsCli } from "./eval-metrics-main"

describe("action quality metrics", () => {
  test("computes action quality from synthetic trace JSONL", async () => {
    const traceDir = await createSyntheticTraceDir()

    const metrics = await computeActionQualityMetricsFromTraceDir(traceDir)

    expect(metrics).toEqual(
      expect.objectContaining({
        noProgressStreak: 2,
        observeBeforeActRatio: 2 / 3,
        sameActionStreak: 2,
        supervisorInterventions: 1,
        toolErrorRate: 1 / 3,
        totalActions: 3,
        totalObservations: 2,
        visualStateNovelty: 1 / 2,
      }),
    )
    expect(metrics.actionEntropy).toBeGreaterThan(0)
  })

  test("writes metrics JSON through the CLI runner", async () => {
    const traceDir = await createSyntheticTraceDir()
    const outputPath = join(
      await mkdtemp(join(tmpdir(), "pokemon-metrics-output-")),
      "metrics.json",
    )

    await runEvalMetricsCli(["--trace", traceDir, "--output", outputPath])

    const metrics = ActionQualityMetricsSchema.parse(JSON.parse(await readFile(outputPath, "utf8")))
    expect(metrics.sameActionStreak).toBe(2)
    expect(metrics.supervisorInterventions).toBe(1)
  })

  test("parses required CLI arguments and rejects incomplete input", () => {
    expect(parseEvalMetricsArgs(["--trace", "run", "--output", "metrics.json"])).toEqual({
      outputPath: "metrics.json",
      traceDir: "run",
    })
    expect(() => parseEvalMetricsArgs(["--trace", "run"])).toThrow()
    expect(() => parseEvalMetricsArgs(["--bad"])).toThrow()
  })
})

async function createSyntheticTraceDir(): Promise<string> {
  const traceDir = await mkdtemp(join(tmpdir(), "pokemon-metrics-trace-"))
  await writeFile(
    join(traceDir, "actions.jsonl"),
    [
      actionLine({
        accepted: true,
        action: { sequence: [{ button: "a", type: "button" }] },
        supervisorInterventions: 1,
        turn: 1,
        verification: { battleChanged: false, dialogChanged: false, moved: false },
      }),
      actionLine({
        accepted: true,
        action: { sequence: [{ button: "a", type: "button" }] },
        turn: 2,
        verification: { battleChanged: false, dialogChanged: false, moved: false },
      }),
      actionLine({
        accepted: false,
        action: { sequence: [{ frames: 60, type: "wait" }] },
        turn: 3,
        verification: { battleChanged: false, dialogChanged: true, moved: false },
      }),
    ].join(""),
    "utf8",
  )
  await writeFile(
    join(traceDir, "observations.jsonl"),
    [
      observationLine({ map: "Pallet Town", player: "x=5, y=6", turn: 1 }),
      observationLine({ map: "Pallet Town", player: "x=5, y=6", turn: 2 }),
    ].join(""),
    "utf8",
  )
  return traceDir
}

function actionLine({
  accepted,
  action,
  supervisorInterventions,
  turn,
  verification,
}: {
  readonly accepted: boolean
  readonly action: unknown
  readonly supervisorInterventions?: number
  readonly turn: number
  readonly verification: {
    readonly battleChanged: boolean
    readonly dialogChanged: boolean
    readonly moved: boolean
  }
}): string {
  return `${JSON.stringify({
    action,
    result: {
      accepted,
      ...(supervisorInterventions === undefined ? {} : { supervisorInterventions }),
      turn,
      verification,
    },
    type: "agent.action",
  })}\n`
}

function observationLine(observation: {
  readonly map: string
  readonly player: string
  readonly turn: number
}): string {
  return `${JSON.stringify({
    frame: observation.turn * 10,
    observation,
    type: "control.observation",
  })}\n`
}
