import type { ActionRequest, GameState } from "./schemas"

export type RecoveryScreenHint = "loading" | "menu" | "unknown"

export type RecoveryPolicyInput = {
  readonly controllerId: string
  readonly screenHint?: RecoveryScreenHint
  readonly state: GameState
}

export type RecoveryDecision =
  | {
      readonly action: ActionRequest
      readonly reason: string
      readonly type: "action"
    }
  | {
      readonly reason: string
      readonly type: "fallback"
    }

export function decideRecoveryAction({
  controllerId,
  screenHint = "unknown",
  state,
}: RecoveryPolicyInput): RecoveryDecision {
  if (state.dialog.active) {
    return {
      action: {
        controllerId,
        sequence: [
          {
            button: "a",
            maxPresses: 10,
            pressFrames: 6,
            type: "text_skip_until_dialog_end",
            waitFrames: 60,
          },
        ],
      },
      reason: "dialog active; advance until clear with bounded A presses",
      type: "action",
    }
  }

  if (screenHint === "menu") {
    return {
      action: {
        controllerId,
        sequence: [
          { button: "b", type: "button" },
          { frames: 60, type: "wait" },
        ],
      },
      reason: "menu suspected; press B and wait for settle",
      type: "action",
    }
  }

  if (screenHint === "loading") {
    return {
      action: {
        controllerId,
        sequence: [{ frames: 60, type: "wait" }],
      },
      reason: "loading suspected; wait bounded frames",
      type: "action",
    }
  }

  return {
    reason: "no deterministic recovery signal; defer to macro planner",
    type: "fallback",
  }
}
