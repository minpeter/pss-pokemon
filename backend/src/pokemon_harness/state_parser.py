from typing import Final, Protocol

from pokemon_harness.gen1_catalog import (
    BADGE_NAMES,
    FACING_NAMES,
    decode_gen1_text,
    item_name,
)
from pokemon_harness.gen1_collision import collision_from_memory
from pokemon_harness.gen1_maps import map_name
from pokemon_harness.gen1_ram_details import (
    read_battle,
    read_party,
    read_player_extras,
)
from pokemon_harness.schemas import (
    BadgesState,
    BagItem,
    BattleState,
    CollisionState,
    DialogState,
    EmulatorState,
    FlagsState,
    GameState,
    MapState,
    PlayerState,
    Position,
)

ADDR_PLAYER_NAME: Final = 0xD158
ADDR_BADGES: Final = 0xD356
ADDR_MAP_ID: Final = 0xD35E
ADDR_MAP_Y: Final = 0xD361
ADDR_MAP_X: Final = 0xD362
ADDR_FACING: Final = 0xC109
ADDR_BAG_COUNT: Final = 0xD31D
ADDR_BAG_ITEMS: Final = 0xD31E
ADDR_BATTLE_TYPE: Final = 0xD057
ADDR_JOY_IGNORE: Final = 0xD730
ADDR_OAK_PARCEL: Final = 0xD74E
ADDR_POKEDEX_FLAG: Final = 0xD74B
ADDR_TOWN_MAP_FLAG: Final = 0xD5F3
MAX_BAG_COUNT: Final = 20


class MemoryView(Protocol):
    def __getitem__(self, address: int) -> int: ...


def parse_pyboy_state(
    *,
    frame: int,
    rom_loaded: bool,
    save_state_loaded: bool,
    memory: MemoryView | None = None,
) -> GameState:
    if memory is not None:
        return _parse_gen1_memory_state(
            frame=frame,
            rom_loaded=rom_loaded,
            save_state_loaded=save_state_loaded,
            memory=memory,
        )
    return GameState(
        emulator=EmulatorState(
            frame=frame,
            romLoaded=rom_loaded,
            saveStateLoaded=save_state_loaded,
        ),
        player=PlayerState(name=None, tile=None, facing=None),
        map=MapState(id=None, name=None),
        party=(),
        bag=(),
        badges=BadgesState(owned=()),
        battle=BattleState(active=False, kind=None, opponent=None),
        dialog=DialogState(active=False, text=None),
        flags=FlagsState(values={}),
        collision=CollisionState(
            mapId=None,
            mapName=None,
            width=0,
            height=0,
            grid=(),
            playerTile=None,
            passableDirections=(),
            ascii=None,
            playerCell=None,
        ),
        parserWarnings=("rich RAM parser pending real save-state calibration",),
    )


def _parse_gen1_memory_state(
    *,
    frame: int,
    rom_loaded: bool,
    save_state_loaded: bool,
    memory: MemoryView,
) -> GameState:
    warnings: list[str] = []
    map_id = _read_u8(memory, ADDR_MAP_ID)
    resolved_map_name = map_name(map_id)
    if resolved_map_name.startswith("Unknown Map"):
        warnings.append(f"unknown map id {map_id}")

    x = _read_u8(memory, ADDR_MAP_X)
    y = _read_u8(memory, ADDR_MAP_Y)
    tile = Position(x=x, y=y)
    facing_byte = _read_u8(memory, ADDR_FACING)
    facing = FACING_NAMES.get(facing_byte)
    if facing is None:
        facing = f"unknown(0x{facing_byte:02X})"
        warnings.append(f"unknown facing byte 0x{facing_byte:02X}")

    badges = _read_badges(memory)
    dialog_active = bool(_read_u8(memory, ADDR_JOY_IGNORE) & 0x20)
    battle_type = _read_u8(memory, ADDR_BATTLE_TYPE)
    player_extras = read_player_extras(memory, warnings)

    return GameState(
        emulator=EmulatorState(
            frame=frame,
            romLoaded=rom_loaded,
            saveStateLoaded=save_state_loaded,
        ),
        player=PlayerState(
            name=decode_gen1_text(_read_range(memory, ADDR_PLAYER_NAME, 11)),
            tile=tile,
            facing=facing,
            rivalName=player_extras.rival_name,
            money=player_extras.money,
            playTime=player_extras.play_time,
            pokedexOwned=player_extras.pokedex_owned,
            pokedexSeen=player_extras.pokedex_seen,
        ),
        map=MapState(id=map_id, name=resolved_map_name),
        party=read_party(memory=memory, warnings=warnings),
        bag=_read_bag(memory=memory, warnings=warnings),
        badges=BadgesState(owned=badges),
        battle=read_battle(memory=memory, battle_type=battle_type),
        dialog=DialogState(active=dialog_active, text=None),
        flags=FlagsState(
            values={
                "hasPokedex": bool(_read_u8(memory, ADDR_POKEDEX_FLAG) & 0x20),
                "hasOaksParcel": bool(_read_u8(memory, ADDR_OAK_PARCEL) & 0x02),
                "hasTownMap": bool(_read_u8(memory, ADDR_TOWN_MAP_FLAG) & 0x01),
            }
        ),
        collision=collision_from_memory(
            map_id=map_id,
            map_name=resolved_map_name,
            player_tile=tile,
            memory=memory,
        ),
        parserWarnings=tuple(warnings),
    )


def _read_bag(*, memory: MemoryView, warnings: list[str]) -> tuple[BagItem, ...]:
    count = _clamped_count(
        raw=_read_u8(memory, ADDR_BAG_COUNT),
        limit=MAX_BAG_COUNT,
        label="bag",
        warnings=warnings,
    )
    items: list[BagItem] = []
    for slot in range(count):
        item_id = _read_u8(memory, ADDR_BAG_ITEMS + (slot * 2))
        if item_id in (0, 0xFF):
            break
        name = item_name(item_id)
        if name.startswith("???"):
            warnings.append(f"unknown bag item byte {item_id}")
        items.append(BagItem(name=name, quantity=_read_u8(memory, ADDR_BAG_ITEMS + (slot * 2) + 1)))
    return tuple(items)


def _read_badges(memory: MemoryView) -> tuple[str, ...]:
    badge_byte = _read_u8(memory, ADDR_BADGES)
    return tuple(name for index, name in enumerate(BADGE_NAMES) if badge_byte & (1 << index))


def _clamped_count(*, raw: int, limit: int, label: str, warnings: list[str]) -> int:
    if raw <= limit:
        return raw
    warnings.append(f"{label} count {raw} clamped to {limit}")
    return limit


def _read_u8(memory: MemoryView, address: int) -> int:
    return memory[address] & 0xFF


def _read_range(memory: MemoryView, address: int, length: int) -> tuple[int, ...]:
    return tuple(_read_u8(memory, address + offset) for offset in range(length))
