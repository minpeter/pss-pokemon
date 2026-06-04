import { readAgentEnv } from "./agent-env"
import { AgentRunError, runAgentControlPlane } from "./agent-runtime"
import { AgentTerminalView } from "./agent-terminal-view"
import { HUMAN_MODEL_ID } from "./control-modes"
import { runHumanControlPlane } from "./human-control-plane"

export async function main(): Promise<void> {
  const env = readAgentEnv()
  const view = new AgentTerminalView()
  try {
    if (env.modelId === HUMAN_MODEL_ID) {
      await runHumanControlPlane({
        backendUrl: env.backendUrl,
        controllerId: env.controllerId,
        view,
      })
      return
    }
    await runAgentControlPlane({
      ...(env.aiApiKey === undefined ? {} : { aiApiKey: env.aiApiKey }),
      aiBaseUrl: env.aiBaseUrl,
      backendUrl: env.backendUrl,
      controllerId: env.controllerId,
      memoryRootDir: ".local/agent-memory",
      modelId: env.modelId,
      onEvent: (event) => {
        view.handleEvent(event)
      },
      onActionObservation: async (observation, turn) => {
        await view.showActionObservation(observation, turn)
      },
      onObservation: async (observation, turn) => {
        await view.showObservation(observation, turn)
      },
      onStatus: (status) => {
        switch (status.type) {
          case "idle":
            view.stopSpinner()
            return
          case "loading":
            view.startSpinner(status.message)
            return
        }
      },
      sessionId: env.sessionId,
    })
  } catch (error) {
    view.stopSpinner()
    if (error instanceof AgentRunError) {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
      return
    }
    throw error
  }
}

if (import.meta.main) {
  await main()
}
