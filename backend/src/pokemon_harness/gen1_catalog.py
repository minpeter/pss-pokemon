from typing import Final

GEN1_TEXT_TERMINATOR: Final = 0x50
HM01_ITEM_ID: Final = 196
HM05_ITEM_ID: Final = 200
TM01_ITEM_ID: Final = 201
TM50_ITEM_ID: Final = 250
HM_ITEM_OFFSET: Final = 195
TM_ITEM_OFFSET: Final = 200

GEN1_TEXT: Final[dict[int, str]] = {
    **{0x80 + index: char for index, char in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ")},
    **{0xA0 + index: char for index, char in enumerate("abcdefghijklmnopqrstuvwxyz")},
    **{0xF6 + index: char for index, char in enumerate("0123456789")},
    0x4F: "\n",
    0x50: "",
    0x51: "\n",
    0x55: "\n",
    0x7F: " ",
    0xE0: "'",
    0xE1: "PK",
    0xE2: "MN",
    0xE3: "-",
    0xE6: "?",
    0xE7: "!",
    0xE8: ".",
    0xF3: "/",
    0xF4: ",",
}

DEX_NAMES: Final[tuple[str, ...]] = (
    "",
    "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard",
    "Squirtle", "Wartortle", "Blastoise", "Caterpie", "Metapod", "Butterfree",
    "Weedle", "Kakuna", "Beedrill", "Pidgey", "Pidgeotto", "Pidgeot",
    "Rattata", "Raticate", "Spearow", "Fearow", "Ekans", "Arbok",
    "Pikachu", "Raichu", "Sandshrew", "Sandslash", "Nidoran-F", "Nidorina",
    "Nidoqueen", "Nidoran-M", "Nidorino", "Nidoking", "Clefairy", "Clefable",
    "Vulpix", "Ninetales", "Jigglypuff", "Wigglytuff", "Zubat", "Golbat",
    "Oddish", "Gloom", "Vileplume", "Paras", "Parasect", "Venonat",
    "Venomoth", "Diglett", "Dugtrio", "Meowth", "Persian", "Psyduck",
    "Golduck", "Mankey", "Primeape", "Growlithe", "Arcanine", "Poliwag",
    "Poliwhirl", "Poliwrath", "Abra", "Kadabra", "Alakazam", "Machop",
    "Machoke", "Machamp", "Bellsprout", "Weepinbell", "Victreebel",
    "Tentacool", "Tentacruel", "Geodude", "Graveler", "Golem", "Ponyta",
    "Rapidash", "Slowpoke", "Slowbro", "Magnemite", "Magneton", "Farfetchd",
    "Doduo", "Dodrio", "Seel", "Dewgong", "Grimer", "Muk", "Shellder",
    "Cloyster", "Gastly", "Haunter", "Gengar", "Onix", "Drowzee", "Hypno",
    "Krabby", "Kingler", "Voltorb", "Electrode", "Exeggcute", "Exeggutor",
    "Cubone", "Marowak", "Hitmonlee", "Hitmonchan", "Lickitung", "Koffing",
    "Weezing", "Rhyhorn", "Rhydon", "Chansey", "Tangela", "Kangaskhan",
    "Horsea", "Seadra", "Goldeen", "Seaking", "Staryu", "Starmie",
    "Mr. Mime", "Scyther", "Jynx", "Electabuzz", "Magmar", "Pinsir",
    "Tauros", "Magikarp", "Gyarados", "Lapras", "Ditto", "Eevee",
    "Vaporeon", "Jolteon", "Flareon", "Porygon", "Omanyte", "Omastar",
    "Kabuto", "Kabutops", "Aerodactyl", "Snorlax", "Articuno", "Zapdos",
    "Moltres", "Dratini", "Dragonair", "Dragonite", "Mewtwo", "Mew",
)

INTERNAL_TO_DEX: Final[dict[int, int]] = {
    1: 112, 2: 115, 3: 32, 4: 35, 5: 21, 6: 100, 7: 34, 8: 80, 9: 2,
    10: 103, 11: 108, 12: 102, 13: 88, 14: 94, 15: 29, 16: 31, 17: 104, 18: 111,
    19: 131, 20: 59, 21: 151, 22: 130, 23: 90, 24: 72, 25: 92, 26: 123, 27: 120,
    28: 9, 29: 127, 30: 114, 33: 58, 34: 95, 35: 22, 36: 16, 37: 79, 38: 64,
    39: 75, 40: 113, 41: 67, 42: 122, 43: 106, 44: 107, 45: 24, 46: 47, 47: 54,
    48: 96, 49: 76, 51: 126, 53: 125, 54: 82, 55: 109, 57: 56, 58: 86, 59: 50,
    60: 128, 64: 83, 65: 48, 66: 149, 70: 84, 71: 60, 72: 124, 73: 146, 74: 144,
    75: 145, 76: 132, 77: 52, 78: 98, 82: 37, 83: 38, 84: 25, 85: 26, 88: 147,
    89: 148, 90: 140, 91: 141, 92: 116, 93: 117, 96: 27, 97: 28, 98: 138, 99: 139,
    100: 39, 101: 40, 102: 133, 103: 136, 104: 135, 105: 134, 106: 66, 107: 41,
    108: 23, 109: 46, 110: 61, 111: 62, 112: 13, 113: 14, 114: 15, 116: 85,
    117: 57, 118: 51, 119: 49, 120: 87, 123: 10, 124: 11, 125: 12, 126: 68,
    128: 55, 129: 97, 130: 42, 131: 150, 132: 143, 133: 129, 136: 89, 138: 99,
    139: 91, 141: 101, 142: 36, 143: 110, 144: 53, 145: 105, 147: 93, 148: 63,
    149: 65, 150: 17, 151: 18, 152: 121, 153: 1, 154: 3, 155: 73, 157: 118,
    158: 119, 163: 77, 164: 78, 165: 19, 166: 20, 167: 33, 168: 30, 169: 74,
    170: 137, 171: 142, 173: 81, 176: 4, 177: 7, 178: 5, 179: 8, 180: 6,
    185: 43, 186: 44, 187: 45, 188: 69, 189: 70, 190: 71,
}

ITEM_NAMES: Final[dict[int, str]] = {
    1: "Master Ball", 2: "Ultra Ball", 3: "Great Ball", 4: "Poke Ball",
    5: "Town Map", 6: "Bicycle", 9: "Pokedex", 10: "Moon Stone",
    11: "Antidote", 12: "Burn Heal", 13: "Ice Heal", 14: "Awakening",
    15: "Parlyz Heal", 16: "Full Restore", 17: "Max Potion", 18: "Hyper Potion",
    19: "Super Potion", 20: "Potion", 29: "Escape Rope", 30: "Repel",
    32: "Fire Stone", 33: "Thunder Stone", 34: "Water Stone", 40: "Rare Candy",
    47: "Leaf Stone", 49: "Nugget", 52: "Full Heal", 53: "Revive",
    54: "Max Revive", 56: "Super Repel", 57: "Max Repel", 60: "Fresh Water",
    61: "Soda Pop", 62: "Lemonade", 63: "S.S. Ticket", 70: "Oak's Parcel",
    71: "Itemfinder", 72: "Silph Scope", 73: "Poke Flute", 76: "Old Rod",
    77: "Good Rod", 78: "Super Rod", 80: "Ether", 81: "Max Ether",
    82: "Elixir", 83: "Max Elixir",
}

BADGE_NAMES: Final[tuple[str, ...]] = (
    "Boulder", "Cascade", "Thunder", "Rainbow", "Soul", "Marsh", "Volcano", "Earth",
)

FACING_NAMES: Final[dict[int, str]] = {
    0x00: "down",
    0x04: "up",
    0x08: "left",
    0x0C: "right",
}

MOVE_NAMES: Final[dict[int, str]] = {
    1: "Pound", 2: "Karate Chop", 3: "Double Slap", 4: "Comet Punch",
    5: "Mega Punch", 6: "Pay Day", 7: "Fire Punch", 8: "Ice Punch",
    9: "Thunder Punch", 10: "Scratch", 11: "Vice Grip", 12: "Guillotine",
    13: "Razor Wind", 14: "Swords Dance", 15: "Cut", 16: "Gust",
    17: "Wing Attack", 18: "Whirlwind", 19: "Fly", 20: "Bind",
    21: "Slam", 22: "Vine Whip", 23: "Stomp", 24: "Double Kick",
    25: "Mega Kick", 26: "Jump Kick", 27: "Rolling Kick", 28: "Sand Attack",
    29: "Headbutt", 30: "Horn Attack", 31: "Fury Attack", 32: "Horn Drill",
    33: "Tackle", 34: "Body Slam", 35: "Wrap", 36: "Take Down",
    37: "Thrash", 38: "Double-Edge", 39: "Tail Whip", 40: "Poison Sting",
    41: "Twineedle", 42: "Pin Missile", 43: "Leer", 44: "Bite",
    45: "Growl", 46: "Roar", 47: "Sing", 48: "Supersonic",
    49: "Sonic Boom", 50: "Disable", 51: "Acid", 52: "Ember",
    53: "Flamethrower", 54: "Mist", 55: "Water Gun", 56: "Hydro Pump",
    57: "Surf", 58: "Ice Beam", 59: "Blizzard", 60: "Psybeam",
    61: "Bubble Beam", 62: "Aurora Beam", 63: "Hyper Beam", 64: "Peck",
    65: "Drill Peck", 66: "Submission", 67: "Low Kick", 68: "Counter",
    69: "Seismic Toss", 70: "Strength", 71: "Absorb", 72: "Mega Drain",
    73: "Leech Seed", 74: "Growth", 75: "Razor Leaf", 76: "Solar Beam",
    77: "Poison Powder", 78: "Stun Spore", 79: "Sleep Powder",
    80: "Petal Dance", 81: "String Shot", 82: "Dragon Rage",
    83: "Fire Spin", 84: "Thunder Shock", 85: "Thunderbolt",
    86: "Thunder Wave", 87: "Thunder", 88: "Rock Throw",
    89: "Earthquake", 90: "Fissure", 91: "Dig", 92: "Toxic",
    93: "Confusion", 94: "Psychic", 95: "Hypnosis", 96: "Meditate",
    97: "Agility", 98: "Quick Attack", 99: "Rage", 100: "Teleport",
    101: "Night Shade", 102: "Mimic", 103: "Screech", 104: "Double Team",
    105: "Recover", 106: "Harden", 107: "Minimize", 108: "Smokescreen",
    109: "Confuse Ray", 110: "Withdraw", 111: "Defense Curl",
    112: "Barrier", 113: "Light Screen", 114: "Haze", 115: "Reflect",
    116: "Focus Energy", 117: "Bide", 118: "Metronome",
    119: "Mirror Move", 120: "Self-Destruct", 121: "Egg Bomb",
    122: "Lick", 123: "Smog", 124: "Sludge", 125: "Bone Club",
    126: "Fire Blast", 127: "Waterfall", 128: "Clamp", 129: "Swift",
    130: "Skull Bash", 131: "Spike Cannon", 132: "Constrict",
    133: "Amnesia", 134: "Kinesis", 135: "Soft-Boiled",
    136: "High Jump Kick", 137: "Glare", 138: "Dream Eater",
    139: "Poison Gas", 140: "Barrage", 141: "Leech Life",
    142: "Lovely Kiss", 143: "Sky Attack", 144: "Transform",
    145: "Bubble", 146: "Dizzy Punch", 147: "Spore",
    148: "Flash", 149: "Psywave", 150: "Splash", 151: "Acid Armor",
    152: "Crabhammer", 153: "Explosion", 154: "Fury Swipes",
    155: "Bonemerang", 156: "Rest", 157: "Rock Slide",
    158: "Hyper Fang", 159: "Sharpen", 160: "Conversion",
    161: "Tri Attack", 162: "Super Fang", 163: "Slash",
    164: "Substitute", 165: "Struggle",
}

TYPE_NAMES: Final[dict[int, str]] = {
    0: "Normal", 1: "Fighting", 2: "Flying", 3: "Poison",
    4: "Ground", 5: "Rock", 6: "Bug", 7: "Ghost",
    20: "Fire", 21: "Water", 22: "Grass", 23: "Electric",
    24: "Ice", 25: "Psychic", 26: "Dragon",
}


def decode_gen1_text(raw: tuple[int, ...]) -> str | None:
    chars: list[str] = []
    for byte in raw:
        if byte == GEN1_TEXT_TERMINATOR:
            break
        chars.append(GEN1_TEXT.get(byte, "?"))
    text = "".join(chars).strip()
    if text == "" or set(text) == {"?"}:
        return None
    return text


def species_name_from_internal(internal_index: int) -> str:
    dex_number = INTERNAL_TO_DEX.get(internal_index)
    if dex_number is None or dex_number >= len(DEX_NAMES):
        return f"???({internal_index})"
    return DEX_NAMES[dex_number]


def item_name(item_id: int) -> str:
    if HM01_ITEM_ID <= item_id <= HM05_ITEM_ID:
        return f"HM{item_id - HM_ITEM_OFFSET:02d}"
    if TM01_ITEM_ID <= item_id <= TM50_ITEM_ID:
        return f"TM{item_id - TM_ITEM_OFFSET:02d}"
    return ITEM_NAMES.get(item_id, f"???({item_id})")


def move_name(move_id: int) -> str:
    return MOVE_NAMES.get(move_id, f"???({move_id})")


def type_name(type_id: int) -> str:
    return TYPE_NAMES.get(type_id, f"???({type_id})")
