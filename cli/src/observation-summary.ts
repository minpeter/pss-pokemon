import type { Observation } from "./schemas"

export function formatObservationSummaryLines(observation: Observation): readonly string[] {
  return [
    renderLocation(observation),
    renderPlayer(observation),
    renderDex(observation),
    renderParty(observation),
    renderBag(observation),
    renderBadges(observation),
    renderFlags(observation),
    renderBattle(observation),
    renderDialog(observation),
    renderHelp(observation),
    renderWarnings(observation),
    ...renderCollision(observation),
  ]
}

function renderLocation(observation: Observation): string {
  const mapName = observation.state.map.name ?? "unknown map"
  const tile = observation.state.player.tile
  const tileText = tile === null ? "unknown" : `${tile.x},${tile.y}`
  const facing = observation.state.player.facing ?? "unknown"
  const passableDirections = observation.state.collision.passableDirections
  const exitsText =
    passableDirections.length === 0 ? "exits unknown" : `exits ${passableDirections.join("/")}`
  return `LOC ${mapName} tile ${tileText} facing ${facing} ${exitsText}`
}

function renderPlayer(observation: Observation): string {
  const playerName = observation.state.player.name ?? "unknown"
  const details = [
    observation.state.player.money === undefined || observation.state.player.money === null
      ? null
      : `$${observation.state.player.money}`,
    formatDetail("time", observation.state.player.playTime),
    formatDetail("rival", observation.state.player.rivalName),
  ].filter((value): value is string => value !== null)
  return `PLAYER ${[playerName, ...details].join(" ")}`
}

function renderDex(observation: Observation): string {
  const owned = observation.state.player.pokedexOwned
  const seen = observation.state.player.pokedexSeen
  if (owned === undefined && seen === undefined) {
    return "DEX unknown"
  }
  return `DEX owned ${owned ?? "?"} seen ${seen ?? "?"}`
}

function renderParty(observation: Observation): string {
  const party = observation.state.party.map(formatPartyMember)
  return `PARTY ${joinOrNone(party)}`
}

function renderBag(observation: Observation): string {
  const bag = observation.state.bag.map((item) => `${item.name} x${item.quantity}`)
  return `BAG ${joinOrNone(bag)}`
}

function renderBadges(observation: Observation): string {
  return `BADGES ${joinOrNone(observation.state.badges.owned)}`
}

function renderFlags(observation: Observation): string {
  const entries = Object.entries(observation.state.flags.values)
  if (entries.length === 0) {
    return "FLAGS none"
  }

  const humanized = entries
    .map(([name, enabled]) => (enabled ? humanizeFlagName(name) : `!${humanizeFlagName(name)}`))
    .sort((left, right) => left.localeCompare(right))
  const raw = entries
    .map(([name, enabled]) => (enabled ? name : `!${name}`))
    .sort((left, right) => left.localeCompare(right))
  return `FLAGS ${humanized.join(", ")} [${raw.join(", ")}]`
}

function renderBattle(observation: Observation): string {
  if (!observation.state.battle.active) {
    return "BATTLE none (field)"
  }

  const enemy = observation.state.battle.enemy
  if (enemy !== undefined && enemy !== null) {
    const kind = observation.state.battle.kind ?? "field"
    const species = enemy.species ?? observation.state.battle.opponent ?? "unknown"
    const level = enemy.level ?? "?"
    const hp = enemy.hp !== null && enemy.maxHp !== null ? `${enemy.hp}/${enemy.maxHp}` : "?"
    const status = enemy.status ?? "OK"
    const moves = enemy.moves?.length === 0 ? null : enemy.moves?.join("/")
    const moveText = moves === undefined || moves === null ? "" : ` enemy moves ${moves}`
    return `BATTLE ${kind} vs ${species} Lv${level} ${hp} ${status}${moveText}`
  }

  const details = [observation.state.battle.kind, observation.state.battle.opponent].filter(
    (value): value is string => value !== null && value.length > 0,
  )
  return `BATTLE ${joinOrField(details)}`
}

function renderDialog(observation: Observation): string {
  if (!observation.state.dialog.active) {
    return "DIALOG none"
  }

  const text = observation.state.dialog.text?.trim()
  return text === undefined || text.length === 0
    ? "DIALOG active text box active"
    : `DIALOG active ${text}`
}

function renderHelp(observation: Observation): string {
  const passableDirections = observation.state.collision.passableDirections
  const passableText =
    passableDirections.length === 0 ? "passable none" : `passable ${passableDirections.join("/")}`
  return `HELP ${passableText}`
}

function renderWarnings(observation: Observation): string {
  const warnings = [
    ...new Set([...observation.state.parserWarnings, ...observation.parserWarnings]),
  ]
  return `WARN ${joinOrNone(warnings)}`
}

function renderCollision(observation: Observation): readonly string[] {
  const ascii = observation.state.collision.ascii
  if (ascii === undefined || ascii === null || ascii.length === 0) {
    return ["COLLISION unavailable"]
  }
  if (ascii.includes("up=row-1 down=row+1 left=col-1 right=col+1")) {
    return ["COLLISION", ascii]
  }
  const playerCell = observation.state.collision.playerCell ?? "E5"
  return [
    "COLLISION",
    ascii,
    "",
    `@ you (${playerCell}) . walkable # blocked`,
    "up=row-1 down=row+1 left=col-1 right=col+1",
  ]
}

function formatPartyMember(member: Observation["state"]["party"][number]): string {
  const species = member.species ?? "unknown"
  const level = member.level ?? "?"
  const label =
    member.nickname !== undefined && member.nickname !== null && member.nickname !== species
      ? `${member.nickname}/${species}`
      : species
  const parts = [`${label} Lv${level}`]
  if (member.hp !== null && member.maxHp !== null) {
    parts.push(`${member.hp}/${member.maxHp}`)
  } else {
    parts.push("?")
  }
  parts.push(member.status ?? "OK")
  const extras = [
    member.types?.length === 0 ? null : formatDetail("types", member.types?.join("/")),
    member.moves?.length === 0 ? null : formatDetail("moves", member.moves?.join("/")),
    formatStats(member.stats),
  ].filter((value): value is string => value !== null)
  if (extras.length > 0) {
    parts.push(`| ${extras.join(" | ")}`)
  }
  return parts.join(" ")
}

function formatDetail(label: string, value: string | null | undefined): string | null {
  return value === undefined || value === null || value.length === 0 ? null : `${label} ${value}`
}

function formatStats(stats: Observation["state"]["party"][number]["stats"]): string | null {
  if (stats === undefined || stats === null) {
    return null
  }
  return `stats Atk${stats.attack} Def${stats.defense} Spd${stats.speed} Spc${stats.special}`
}

function humanizeFlagName(name: string): string {
  switch (name) {
    case "hasPokedex":
      return "Pokedex"
    case "hasOaksParcel":
      return "Oak's Parcel"
    case "hasTownMap":
      return "Town Map"
    default:
      return (
        name
          .replace(/^has/, "")
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .trim() || name
      )
  }
}

function joinOrField(values: readonly string[]): string {
  return values.length === 0 ? "field" : values.join(" vs ")
}

function joinOrNone(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ")
}
