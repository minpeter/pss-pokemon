import type { Observation, Screenshot } from "./schemas"

export type AgentObservation = Observation & {
  readonly gridScreenshot: Screenshot
}

export function hasGridScreenshot(observation: Observation): observation is AgentObservation {
  return "gridScreenshot" in observation
}
