import type { AgentObservation } from "./agent-observation-types"
import type { PokemonActionExecution } from "./pokemon-action-executor"
import type { ActionRequest, GameState, Screenshot } from "./schemas"
import {
  createTraceWriter,
  isSafeTraceRunId,
  type TraceJsonObject,
  TraceRunIdError,
  type TraceWriter,
} from "./trace-writer"

export type TraceObservationPhase = "beforeTurn" | "afterAction"
export type TraceActionActor = "agent" | "human"

export type TraceEnvConfig = {
  readonly traceRootDir?: string
  readonly traceRunId?: string
}

export function resolveTraceConfig({
  defaultRunId,
  rootDir,
  runId,
}: {
  readonly defaultRunId: string
  readonly rootDir: string | undefined
  readonly runId: string | undefined
}): TraceEnvConfig {
  if (rootDir === undefined) {
    return {}
  }
  const resolvedRunId = runId ?? defaultRunId
  if (!isSafeTraceRunId(resolvedRunId)) {
    throw new TraceRunIdError(resolvedRunId)
  }
  return { traceRootDir: rootDir, traceRunId: resolvedRunId }
}

export async function createOptionalTraceWriter({
  metadata,
  rootDir,
  runId,
}: {
  readonly metadata: unknown
  readonly rootDir: string | undefined
  readonly runId: string | undefined
}): Promise<TraceWriter | undefined> {
  if (rootDir === undefined || runId === undefined) {
    return undefined
  }
  return createTraceWriter({ metadata, rootDir, runId })
}

export async function recordTraceObservation(
  traceWriter: TraceWriter | undefined,
  observation: AgentObservation,
  turn: number,
  phase: TraceObservationPhase,
): Promise<void> {
  if (traceWriter === undefined) {
    return
  }
  await traceWriter.appendObservation({
    frame: observation.frame,
    observation: createTraceObservationPayload({ observation, phase, turn }),
    type: "control.observation",
  })
}

export async function recordTraceActionExecution(
  traceWriter: TraceWriter | undefined,
  execution: PokemonActionExecution,
  turn: number,
  actor: TraceActionActor,
): Promise<void> {
  if (traceWriter === undefined) {
    return
  }
  await traceWriter.appendAction({
    action: actionRequestPayload(execution.observation.lastAction),
    result: {
      actor,
      accepted: execution.response.accepted,
      frameAfter: execution.response.frameAfter,
      frameBefore: execution.response.frameBefore,
      frameDelta: execution.response.frameAfter - execution.response.frameBefore,
      observation: createTraceObservationPayload({
        observation: execution.observation,
        phase: "afterAction",
        turn,
      }),
      turn,
      verification: verificationPayload(execution),
    },
    type: `${actor}.action`,
  })
}

function createTraceObservationPayload({
  observation,
  phase,
  turn,
}: {
  readonly observation: AgentObservation
  readonly phase: TraceObservationPhase
  readonly turn: number
}): TraceJsonObject {
  const state = observation.state
  return {
    battle: {
      active: state.battle.active,
      kind: state.battle.kind,
      opponent: state.battle.opponent,
    },
    collision: {
      height: state.collision.height,
      mapId: state.collision.mapId,
      mapName: state.collision.mapName,
      passableDirections: state.collision.passableDirections,
      playerCell: state.collision.playerCell ?? null,
      width: state.collision.width,
    },
    dialog: {
      active: state.dialog.active,
      textLength: state.dialog.text?.length ?? 0,
    },
    emulator: {
      frame: state.emulator.frame,
      romLoaded: state.emulator.romLoaded,
      saveStateLoaded: state.emulator.saveStateLoaded,
    },
    frame: observation.frame,
    gridScreenshot: screenshotMetadata(observation.gridScreenshot),
    lastAction:
      observation.lastAction === null ? null : actionRequestPayload(observation.lastAction),
    map: {
      id: state.map.id,
      name: state.map.name,
    },
    parserWarnings: {
      observation: observation.parserWarnings.length,
      state: state.parserWarnings.length,
    },
    party: {
      count: state.party.length,
      lead: state.party.at(0)?.species ?? null,
    },
    phase,
    player: {
      facing: state.player.facing,
      name: state.player.name,
      tile: formatTile(state.player.tile),
    },
    screenshot: screenshotMetadata(observation.screenshot),
    timestamp: observation.timestamp,
    turn,
  }
}

function actionRequestPayload(action: ActionRequest | null): TraceJsonObject {
  if (action === null) {
    return { present: false }
  }
  return {
    controllerId: action.controllerId,
    sequence: action.sequence.map(actionStepPayload),
  }
}

function actionStepPayload(step: ActionRequest["sequence"][number]): TraceJsonObject {
  switch (step.type) {
    case "button":
      return {
        button: step.button,
        ...(step.pressFrames === undefined ? {} : { pressFrames: step.pressFrames }),
        ...(step.waitFrames === undefined ? {} : { waitFrames: step.waitFrames }),
        type: step.type,
      }
    case "hold":
      return { button: step.button, frames: step.frames, type: step.type }
    case "text_skip_until_dialog_end":
      return {
        button: step.button ?? "a",
        ...(step.maxPresses === undefined ? {} : { maxPresses: step.maxPresses }),
        ...(step.pressFrames === undefined ? {} : { pressFrames: step.pressFrames }),
        ...(step.waitFrames === undefined ? {} : { waitFrames: step.waitFrames }),
        type: step.type,
      }
    case "wait":
      return { frames: step.frames, type: step.type }
    case "walk":
      return {
        direction: step.direction,
        ...(step.pressFrames === undefined ? {} : { pressFrames: step.pressFrames }),
        ...(step.waitFrames === undefined ? {} : { waitFrames: step.waitFrames }),
        type: step.type,
      }
    default:
      return assertNever(step)
  }
}

function screenshotMetadata(screenshot: Screenshot): TraceJsonObject {
  return {
    ...(screenshot.frame === undefined ? {} : { frame: screenshot.frame }),
    ...(screenshot.height === undefined ? {} : { height: screenshot.height }),
    pngBase64Length: screenshot.pngBase64.length,
    ...(screenshot.width === undefined ? {} : { width: screenshot.width }),
  }
}

function verificationPayload(execution: PokemonActionExecution): TraceJsonObject {
  const verification = execution.verification
  return {
    battleChanged: verification.battleChanged,
    dialogChanged: verification.dialogChanged,
    frameAdvanced: verification.frameAdvanced,
    moved: verification.moved,
    playerTileAfter: verification.playerTileAfter,
    playerTileBefore: verification.playerTileBefore,
    stateChanged: verification.stateChanged,
    summary: verification.summary,
  }
}

function formatTile(tile: GameState["player"]["tile"]): string {
  return tile === null ? "unknown" : `x=${tile.x}, y=${tile.y}`
}

function assertNever(value: never): never {
  throw new UnhandledTraceActionStepError(value)
}

class UnhandledTraceActionStepError extends Error {
  constructor(readonly value: never) {
    super(`unhandled trace action step: ${JSON.stringify(value)}`)
    this.name = "UnhandledTraceActionStepError"
  }
}
