import { describe, expect, test } from "bun:test"
import type { AgentObservation } from "./agent-observation-types"
import { createRecordingTransport } from "./agent-test-fixtures"
import { PokemonApiClient } from "./api-client"
import { HUMAN_CONTROLLER_ID } from "./control-modes"
import {
  type HumanControlView,
  type HumanKeyInput,
  runHumanControlPlane,
} from "./human-control-plane"

describe("runHumanControlPlane", () => {
  test("uses the shared observation and action path for keyboard actions", async () => {
    const sentPayloads: unknown[] = []
    const observations: string[] = []
    const client = new PokemonApiClient(createRecordingTransport(sentPayloads))

    await runHumanControlPlane({
      backendUrl: "http://127.0.0.1:8765",
      client,
      input: new SingleKeyInput("j"),
      maxTurns: 1,
      view: createRecordingView(observations),
    })

    expect(sentPayloads).toEqual([
      {
        path: "control/heartbeat",
        payload: {
          controllerId: HUMAN_CONTROLLER_ID,
        },
      },
      {
        path: "action",
        payload: {
          controllerId: HUMAN_CONTROLLER_ID,
          sequence: [{ type: "button", button: "a" }],
        },
      },
      {
        path: "control/release",
        payload: {
          controllerId: HUMAN_CONTROLLER_ID,
        },
      },
    ])
    expect(observations).toEqual(["before:1:grid", "after:1:grid:action"])
  })
})

class SingleKeyInput implements HumanKeyInput {
  readonly isTTY = true
  #listener: ((chunk: string | Uint8Array) => void) | null = null

  constructor(readonly key: string) {}

  off(_event: "data", listener: (chunk: string | Uint8Array) => void): void {
    if (this.#listener === listener) {
      this.#listener = null
    }
  }

  on(_event: "data", listener: (chunk: string | Uint8Array) => void): void {
    this.#listener = listener
    queueMicrotask(() => {
      this.#listener?.(this.key)
    })
  }

  pause(): void {}

  resume(): void {}

  setEncoding(_encoding: BufferEncoding): void {}

  setRawMode(_mode: boolean): void {}
}

function createRecordingView(observations: string[]): HumanControlView {
  return {
    showActionObservation: (observation, turn) => {
      observations.push(
        `after:${turn}:${hasGrid(observation) ? "grid" : "no-grid"}:${
          observation.lastAction === null ? "none" : "action"
        }`,
      )
      return Promise.resolve()
    },
    showObservation: (observation, turn) => {
      observations.push(`before:${turn}:${hasGrid(observation) ? "grid" : "no-grid"}`)
      return Promise.resolve()
    },
  }
}

function hasGrid(observation: AgentObservation): boolean {
  return observation.gridScreenshot.pngBase64.length > 0
}
