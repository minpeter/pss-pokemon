import { captureAgentObservation } from "./agent-observation"
import type { AgentObservation } from "./agent-observation-types"
import type { PokemonApiClient } from "./api-client"
import type { ActionRequest, ActionResponse, GameState, Observation } from "./schemas"

export interface PokemonActionExecution {
  readonly before: GameState
  readonly observation: AgentObservation
  readonly response: ActionResponse
  readonly verification: ActionVerification
}

export interface ActionVerification {
  readonly battleChanged: boolean
  readonly dialogChanged: boolean
  readonly frameAdvanced: boolean
  readonly moved: boolean
  readonly playerTileAfter: string
  readonly playerTileBefore: string
  readonly stateChanged: boolean
  readonly summary: string
}

export async function executePokemonAction({
  action,
  client,
}: {
  readonly action: ActionRequest
  readonly client: PokemonApiClient
}): Promise<PokemonActionExecution> {
  const before = await client.state()
  const response = await client.sendAction(action)
  const observation = { ...(await captureAgentObservation(client)), lastAction: action }
  return {
    before,
    observation,
    response,
    verification: createVerification({ after: response.observation.state, before, response }),
  }
}

export function formatPlayerTile(observation: Observation): string {
  return formatTile(observation.state.player.tile)
}

function createVerification({
  after,
  before,
  response,
}: {
  readonly after: GameState
  readonly before: GameState
  readonly response: ActionResponse
}): ActionVerification {
  const playerTileBefore = formatTile(before.player.tile)
  const playerTileAfter = formatTile(after.player.tile)
  const moved = playerTileBefore !== playerTileAfter
  const dialogChanged =
    before.dialog.active !== after.dialog.active || before.dialog.text !== after.dialog.text
  const battleChanged = JSON.stringify(before.battle) !== JSON.stringify(after.battle)
  const frameAdvanced = response.frameAfter > response.frameBefore
  const stateChanged = moved || dialogChanged || battleChanged || frameAdvanced
  return {
    battleChanged,
    dialogChanged,
    frameAdvanced,
    moved,
    playerTileAfter,
    playerTileBefore,
    stateChanged,
    summary: [
      frameAdvanced ? "frame advanced" : "frame unchanged",
      moved ? `moved ${playerTileBefore} -> ${playerTileAfter}` : "position unchanged",
      dialogChanged ? "dialog changed" : "dialog unchanged",
      battleChanged ? "battle changed" : "battle unchanged",
    ].join("; "),
  }
}

function formatTile(tile: GameState["player"]["tile"]): string {
  return tile === null ? "unknown" : `x=${tile.x}, y=${tile.y}`
}
