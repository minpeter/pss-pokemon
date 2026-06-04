import { runHumanControlPlane } from "./human-control-plane"
import { readHumanEnv } from "./human-env"

export async function main(): Promise<void> {
  const env = readHumanEnv()
  await runHumanControlPlane({
    backendUrl: env.backendUrl,
  })
}

if (import.meta.main) {
  await main()
}
