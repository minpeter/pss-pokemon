import type { ProgressFactMemory, UntrustedDialogMemory } from "./agent-memory-model"
import type { GameState } from "./schemas"

const MAX_PROGRESS_FACTS = 12
const MAX_UNTRUSTED_DIALOG_FACTS = 3

export function collectProgressFacts({
  frame,
  state,
  turn,
}: {
  readonly frame: number
  readonly state: GameState
  readonly turn: number
}): readonly ProgressFactMemory[] {
  return [
    ...Object.entries(state.flags.values)
      .filter(([, value]) => value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key]) =>
        createProgressFact({ fact: `flag ${sanitizeInline(key)}=true`, frame, turn }),
      ),
    ...state.bag
      .filter((item) => item.quantity > 0)
      .map((item) =>
        createProgressFact({
          fact: `item ${sanitizeInline(item.name)} x${item.quantity}`,
          frame,
          turn,
        }),
      ),
    ...state.badges.owned.map((badge) =>
      createProgressFact({ fact: `badge ${sanitizeInline(badge)}`, frame, turn }),
    ),
  ]
}

export function collectDialogFact({
  frame,
  state,
  turn,
}: {
  readonly frame: number
  readonly state: GameState
  readonly turn: number
}): UntrustedDialogMemory | null {
  if (!state.dialog.active || state.dialog.text === null) {
    return null
  }
  const text = sanitizeInline(state.dialog.text)
  return text.length === 0 ? null : { frame, text, turn }
}

export function mergeProgressFacts({
  current,
  next,
}: {
  readonly current: readonly ProgressFactMemory[]
  readonly next: readonly ProgressFactMemory[]
}): readonly ProgressFactMemory[] {
  const byFact = new Map<string, ProgressFactMemory>()
  for (const fact of current) {
    byFact.set(fact.fact, fact)
  }
  for (const fact of next) {
    byFact.set(fact.fact, fact)
  }
  return Array.from(byFact.values()).sort(compareMemoryRecency).slice(-MAX_PROGRESS_FACTS)
}

export function mergeDialogFacts({
  current,
  next,
}: {
  readonly current: readonly UntrustedDialogMemory[]
  readonly next: UntrustedDialogMemory | null
}): readonly UntrustedDialogMemory[] {
  return next === null
    ? current.slice(-MAX_UNTRUSTED_DIALOG_FACTS)
    : [...current, next].slice(-MAX_UNTRUSTED_DIALOG_FACTS)
}

function createProgressFact({
  fact,
  frame,
  turn,
}: {
  readonly fact: string
  readonly frame: number
  readonly turn: number
}): ProgressFactMemory {
  return { fact, frame, turn }
}

function sanitizeInline(value: string): string {
  return Array.from(value, replaceControlCharacter)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
}

function replaceControlCharacter(character: string): string {
  const code = character.charCodeAt(0)
  return code < 32 || code === 127 ? " " : character
}

function compareMemoryRecency(left: ProgressFactMemory, right: ProgressFactMemory): number {
  return left.frame - right.frame
}
