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

  test("keeps dot-only session ids inside the memory root", async () => {
    const parentDir = await mkdtemp(join(tmpdir(), "pokemon-memory-sanitize-"))
    const rootDir = join(parentDir, "root")
    const memory = await createFilePokemonAgentMemory({ rootDir, sessionId: ".." })

    await memory.recordAction(createExecution(), 1)

    const episodeLog = await readFile(join(rootDir, "pokemon-agent", "episodes.jsonl"), "utf8")
    expect(episodeLog).toContain('"turn":1')
    let escapedWriteExists = false
    try {
      await readFile(join(parentDir, "episodes.jsonl"), "utf8")
      escapedWriteExists = true
    } catch {
      escapedWriteExists = false
    }
    expect(escapedWriteExists).toBe(false)
  })

  test("persists semantic progress facts across reloads", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "pokemon-memory-progress-"))
    const memory = await createFilePokemonAgentMemory({ rootDir, sessionId: "progress" })

    await memory.recordAction(createProgressExecution(), 1)

    const reloaded = await createFilePokemonAgentMemory({ rootDir, sessionId: "progress" })
    const context = reloaded.renderContext(observationFixture)

    expect(context).toContain("PROGRESS_FACT flag hasOaksParcel=true")
    expect(context).toContain("PROGRESS_FACT item Oak's Parcel x1")
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

function createProgressExecution(): PokemonActionExecution {
  const state = {
    ...observationFixture.state,
    bag: [{ name: "Oak's Parcel", quantity: 1 }],
    flags: { values: { hasOaksParcel: true } },
  }
  return {
    ...createExecution(),
    response: {
      ...createExecution().response,
      observation: {
        ...createExecution().response.observation,
        state,
      },
    },
    verification: {
      ...createExecution().verification,
      moved: true,
      summary: "frame advanced; got parcel",
    },
  }
}
