import { formatMemoryContext } from "./agent-memory-context"
import {
  EMPTY_MEMORY_PROJECTION,
  type PokemonAgentMemory,
  type PokemonAgentMemoryRecorder,
  type PokemonMemoryProjectionInput,
  PokemonMemoryProjectionSchema,
} from "./agent-memory-model"
import { updateProjection } from "./agent-memory-reducer"

export { formatMemoryContext } from "./agent-memory-context"
export {
  EMPTY_MEMORY_PROJECTION,
  type MovementAttemptMemory,
  type PokemonAgentMemory,
  type PokemonAgentMemoryRecord,
  type PokemonAgentMemoryRecorder,
  type PokemonMemoryProjection,
  PokemonMemoryProjectionSchema,
  type ProgressFactMemory,
  type RecentActionMemory,
  type UntrustedDialogMemory,
} from "./agent-memory-model"

export function createInMemoryPokemonAgentMemory(
  initialProjection: PokemonMemoryProjectionInput = EMPTY_MEMORY_PROJECTION,
  onRecord?: PokemonAgentMemoryRecorder,
): PokemonAgentMemory {
  let projection = PokemonMemoryProjectionSchema.parse(initialProjection)
  return {
    get projection() {
      return projection
    },
    recordAction: async (execution, turn) => {
      projection = updateProjection({ execution, projection, turn })
      await onRecord?.({ execution, projection, turn })
    },
    renderContext: (observation) => formatMemoryContext({ observation, projection }),
  }
}
