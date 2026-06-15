import type { ActionRequest } from "./schemas"

const CONTROLLER_ID = "manual-cli"

const KEY_TO_BUTTON = {
  w: "up",
  a: "left",
  s: "down",
  d: "right",
  j: "a",
  k: "b",
  "\r": "start",
  "\n": "start",
  "\b": "select",
} as const

type KeyName = keyof typeof KEY_TO_BUTTON

export function actionForKey(key: string, controllerId = CONTROLLER_ID): ActionRequest | null {
  if (key === "J") {
    return textSkipAction(controllerId)
  }
  if (!isMappedKey(key)) {
    return null
  }
  return {
    controllerId,
    sequence: [{ type: "button", button: KEY_TO_BUTTON[key] }],
  }
}

function textSkipAction(controllerId: string): ActionRequest {
  return {
    controllerId,
    sequence: [{ type: "text_skip_until_dialog_end", button: "a" }],
  }
}

function isMappedKey(key: string): key is KeyName {
  return Object.hasOwn(KEY_TO_BUTTON, key)
}
