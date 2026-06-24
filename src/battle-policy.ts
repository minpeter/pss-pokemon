import type { ActionRequest, GameState } from "./schemas"

export type BattleMenuHint = "bag" | "fight" | "main" | "unknown"

export type BattlePolicyInput = {
  readonly controllerId: string
  readonly menuHint?: BattleMenuHint
  readonly state: GameState
}

export type BattlePolicyDecision =
  | {
      readonly action: ActionRequest
      readonly reason: string
      readonly type: "action"
    }
  | {
      readonly reason: string
      readonly type: "fallback"
    }

export function decideBattleAction({
  controllerId,
  menuHint = "main",
  state,
}: BattlePolicyInput): BattlePolicyDecision {
  if (!state.battle.active) {
    return { reason: "battle is not active", type: "fallback" }
  }

  if (menuHint === "bag") {
    return {
      action: {
        controllerId,
        sequence: [
          { button: "b", type: "button" },
          { frames: 60, type: "wait" },
        ],
      },
      reason: "bag menu suspected; back out to avoid item waste",
      type: "action",
    }
  }

  const lead = state.party.at(0)
  if (lead === undefined || lead.moves === undefined || lead.moves.length === 0) {
    return { reason: "lead move state is unknown", type: "fallback" }
  }

  if (menuHint === "unknown") {
    return { reason: "battle menu state is unknown", type: "fallback" }
  }

  return {
    action: {
      controllerId,
      sequence: defaultAttackSequence(menuHint),
    },
    reason: `battle_policy.default_attack default attack with ${lead.moves[0]}`,
    type: "action",
  }
}

function defaultAttackSequence(
  menuHint: Exclude<BattleMenuHint, "bag" | "unknown">,
): ActionRequest["sequence"] {
  return menuHint === "fight"
    ? [{ button: "a", type: "button" }]
    : [
        { button: "a", type: "button" },
        { button: "a", type: "button" },
      ]
}
