import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createFilePokemonAgentMemory } from "./agent-memory-file-store"
import { observationFixture } from "./agent-test-fixtures"
import type { PokemonActionExecution } from "./pokemon-action-executor"

describe("file Pokemon agent memory", () => {
  test("persists episodes and reloads the Pokemon projection", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-memory-"))
    const memory = await createFilePokemonAgentMemory({ rootDir, sessionId: "qa/session" })

    await memory.recordAction(createExecution(), 1)

    const reloaded = await createFilePokemonAgentMemory({ rootDir, sessionId: "qa/session" })
    const context = reloaded.renderContext(observationFixture)
    const episodeLog = await readFile(join(rootDir, "qa-session", "episodes.jsonl"), "utf8")

    expect(context).toContain("RECENT_ACTIONS T1 Pallet Town x=5, y=6 press_up")
    expect(episodeLog).toContain('"turn":1')
    expect(episodeLog).toContain('"mapName":"Pallet Town"')
  })
})

function createExecution(): PokemonActionExecution {
  return {
    before: observationFixture.state,
    observation: {
      ...observationFixture,
      lastAction: {
        controllerId: "agent-test",
        sequence: [{ button: "up", type: "button" }],
      },
    },
    response: {
      accepted: true,
      frameAfter: 27,
      frameBefore: 26,
      observation: {
        ...observationFixture,
        lastAction: {
          controllerId: "agent-test",
          sequence: [{ button: "up", type: "button" }],
        },
      },
    },
    verification: {
      battleChanged: false,
      dialogChanged: false,
      frameAdvanced: true,
      moved: false,
      playerTileAfter: "x=5, y=6",
      playerTileBefore: "x=5, y=6",
      stateChanged: true,
      summary: "frame advanced; position unchanged; dialog unchanged; battle unchanged",
    },
  }
}
