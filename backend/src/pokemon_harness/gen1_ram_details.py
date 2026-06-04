from dataclasses import dataclass
from typing import Final, Protocol

from pokemon_harness.gen1_catalog import (
    decode_gen1_text,
    move_name,
    species_name_from_internal,
    type_name,
)
from pokemon_harness.schemas import BattleEnemy, BattleState, PartyMember, PartyStats

ADDR_RIVAL_NAME: Final = 0xD34A
ADDR_MONEY: Final = 0xD347
ADDR_PARTY_COUNT: Final = 0xD163
ADDR_PARTY_DATA: Final = 0xD16B
ADDR_PARTY_NICKS: Final = 0xD2B5
ADDR_DEX_OWNED: Final = 0xD2F7
ADDR_DEX_SEEN: Final = 0xD30A
ADDR_ENEMY_SPECIES: Final = 0xD89D
ADDR_ENEMY_DATA: Final = 0xD8A4
ADDR_PLAYTIME_HOURS: Final = 0xDA40
ADDR_PLAYTIME_MINUTES: Final = 0xDA42
ADDR_PLAYTIME_SECONDS: Final = 0xDA43
PARTY_MON_SIZE: Final = 44
MAX_PARTY_COUNT: Final = 6
DEX_SPECIES_COUNT: Final = 151
MAX_BCD_DIGIT: Final = 9
BATTLE_TYPE_NONE: Final = 0
BATTLE_TYPE_WILD: Final = 1
BATTLE_TYPE_TRAINER: Final = 2


class MemoryView(Protocol):
    def __getitem__(self, address: int) -> int: ...


@dataclass(frozen=True, slots=True)
class PlayerExtras:
    rival_name: str | None
    money: int | None
    play_time: str
    pokedex_owned: int
    pokedex_seen: int


def read_player_extras(memory: MemoryView, warnings: list[str]) -> PlayerExtras:
    hours = _read_u16_be(memory, ADDR_PLAYTIME_HOURS)
    minutes = _read_u8(memory, ADDR_PLAYTIME_MINUTES)
    seconds = _read_u8(memory, ADDR_PLAYTIME_SECONDS)
    return PlayerExtras(
        rival_name=decode_gen1_text(_read_range(memory, ADDR_RIVAL_NAME, 11)),
        money=_read_bcd_money(memory=memory, address=ADDR_MONEY, warnings=warnings),
        play_time=f"{hours}:{minutes:02d}:{seconds:02d}",
        pokedex_owned=_count_bits(memory=memory, address=ADDR_DEX_OWNED),
        pokedex_seen=_count_bits(memory=memory, address=ADDR_DEX_SEEN),
    )


def read_party(memory: MemoryView, warnings: list[str]) -> tuple[PartyMember, ...]:
    raw_count = _read_u8(memory, ADDR_PARTY_COUNT)
    count = _clamped_count(raw=raw_count, limit=MAX_PARTY_COUNT, label="party", warnings=warnings)
    members: list[PartyMember] = []
    for slot in range(count):
        base = ADDR_PARTY_DATA + (slot * PARTY_MON_SIZE)
        species_id = _read_u8(memory, base)
        if species_id in (0, 0xFF):
            continue
        members.append(_read_party_member(memory, base, ADDR_PARTY_NICKS + (slot * 11), warnings))
    return tuple(members)


def read_battle(memory: MemoryView, battle_type: int) -> BattleState:
    if battle_type == BATTLE_TYPE_NONE:
        return BattleState(active=False, kind=None, opponent=None, enemy=None)
    if battle_type == BATTLE_TYPE_WILD:
        kind = "wild"
    elif battle_type == BATTLE_TYPE_TRAINER:
        kind = "trainer"
    else:
        kind = f"unknown({battle_type})"

    enemy = _read_battle_enemy(memory)
    return BattleState(active=True, kind=kind, opponent=enemy.species, enemy=enemy)


def _read_party_member(
    memory: MemoryView,
    base: int,
    nickname_address: int,
    warnings: list[str],
) -> PartyMember:
    species_id = _read_u8(memory, base)
    species = species_name_from_internal(species_id)
    if species.startswith("???"):
        warnings.append(f"unknown party species byte {species_id}")
    return PartyMember(
        species=species,
        level=_read_u8(memory, base + 33),
        hp=_read_u16_be(memory, base + 1),
        maxHp=_read_u16_be(memory, base + 34),
        status=_status_name(_read_u8(memory, base + 4)),
        nickname=decode_gen1_text(_read_range(memory, nickname_address, 11)),
        types=_read_type_names(memory=memory, base=base, warnings=warnings),
        moves=_read_move_names(memory=memory, base=base, warnings=warnings),
        stats=PartyStats(
            attack=_read_u16_be(memory, base + 36),
            defense=_read_u16_be(memory, base + 38),
            speed=_read_u16_be(memory, base + 40),
            special=_read_u16_be(memory, base + 42),
        ),
    )


def _read_battle_enemy(memory: MemoryView) -> BattleEnemy:
    base = ADDR_ENEMY_DATA
    species_id = _read_u8(memory, ADDR_ENEMY_SPECIES)
    return BattleEnemy(
        species=species_name_from_internal(species_id),
        level=_read_u8(memory, base + 33),
        hp=_read_u16_be(memory, base + 1),
        maxHp=_read_u16_be(memory, base + 34),
        status=_status_name(_read_u8(memory, base + 4)),
        moves=tuple(
            move_name(move_id)
            for move_id in (_read_u8(memory, base + offset) for offset in range(8, 12))
            if move_id != 0
        ),
    )


def _read_type_names(*, memory: MemoryView, base: int, warnings: list[str]) -> tuple[str, ...]:
    names: list[str] = []
    for type_id in (_read_u8(memory, base + 5), _read_u8(memory, base + 6)):
        name = type_name(type_id)
        if name.startswith("???"):
            warnings.append(f"unknown type byte {type_id}")
        if name not in names:
            names.append(name)
    return tuple(names)


def _read_move_names(*, memory: MemoryView, base: int, warnings: list[str]) -> tuple[str, ...]:
    names: list[str] = []
    for offset in range(8, 12):
        move_id = _read_u8(memory, base + offset)
        if move_id == 0:
            continue
        name = move_name(move_id)
        if name.startswith("???"):
            warnings.append(f"unknown move byte {move_id}")
        names.append(name)
    return tuple(names)


def _read_bcd_money(*, memory: MemoryView, address: int, warnings: list[str]) -> int | None:
    digits: list[str] = []
    for offset in range(3):
        byte = _read_u8(memory, address + offset)
        high = byte >> 4
        low = byte & 0x0F
        if high > MAX_BCD_DIGIT or low > MAX_BCD_DIGIT:
            warnings.append(f"invalid money BCD byte 0x{byte:02X}")
            return None
        digits.extend((str(high), str(low)))
    return int("".join(digits))


def _count_bits(*, memory: MemoryView, address: int) -> int:
    total = 0
    for index in range(DEX_SPECIES_COUNT):
        byte = _read_u8(memory, address + (index // 8))
        total += (byte >> (index % 8)) & 1
    return total


def _status_name(status: int) -> str | None:
    if status == 0:
        return None
    names = _status_names(status)
    if len(names) == 0:
        return f"0x{status:02X}"
    return "/".join(names)


def _status_names(status: int) -> tuple[str, ...]:
    sleep_turns = status & 0x07
    names: list[str] = []
    if sleep_turns > 0:
        names.append(f"SLP({sleep_turns})")
    if status & 0x08:
        names.append("PSN")
    if status & 0x10:
        names.append("BRN")
    if status & 0x20:
        names.append("FRZ")
    if status & 0x40:
        names.append("PAR")
    return tuple(names)


def _clamped_count(*, raw: int, limit: int, label: str, warnings: list[str]) -> int:
    if raw <= limit:
        return raw
    warnings.append(f"{label} count {raw} clamped to {limit}")
    return limit


def _read_u8(memory: MemoryView, address: int) -> int:
    return memory[address] & 0xFF


def _read_u16_be(memory: MemoryView, address: int) -> int:
    return (_read_u8(memory, address) << 8) | _read_u8(memory, address + 1)


def _read_range(memory: MemoryView, address: int, length: int) -> tuple[int, ...]:
    return tuple(_read_u8(memory, address + offset) for offset in range(length))
