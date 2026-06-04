from collections.abc import Iterable

from pokemon_harness.gen1_collision import (
    ADDR_TILEMAP,
    ADDR_TILESET,
    ADDR_TILESET_COLLISION_PTR,
    TILEMAP_WIDTH,
)
from pokemon_harness.gen1_maps import MAP_NAMES, VANILLA_MAP_IDS, map_name
from pokemon_harness.schemas import Position
from pokemon_harness.state_parser import parse_pyboy_state


class FakeMemory:
    def __init__(self, entries: Iterable[tuple[int, int]]) -> None:
        self._bytes: dict[int, int] = dict(entries)

    def __getitem__(self, address: int) -> int:
        return self._bytes.get(address, 0)


def encoded_text(address: int, text: str) -> list[tuple[int, int]]:
    encoded: list[tuple[int, int]] = []
    for offset, char in enumerate(text):
        if "A" <= char <= "Z":
            encoded.append((address + offset, 0x80 + ord(char) - ord("A")))
        else:
            encoded.append((address + offset, 0x7F))
    encoded.append((address + len(text), 0x50))
    return encoded


def party_mon(
    address: int,
    *,
    species: int,
    hp: int,
    level: int,
    max_hp: int,
) -> list[tuple[int, int]]:
    data = [0] * 44
    data[0] = species
    data[1] = (hp >> 8) & 0xFF
    data[2] = hp & 0xFF
    data[33] = level
    data[34] = (max_hp >> 8) & 0xFF
    data[35] = max_hp & 0xFF
    return [(address + offset, value) for offset, value in enumerate(data)]


def test_parse_pyboy_state_reads_curated_gen1_ram_fields() -> None:
    memory = FakeMemory(
        [
            *encoded_text(0xD158, "RED"),
            (0xD35E, 0),
            (0xD361, 6),
            (0xD362, 5),
            (0xC109, 0x04),
            (0xD163, 1),
            (0xD164, 177),
            *party_mon(0xD16B, species=177, hp=19, level=5, max_hp=19),
            (0xD31D, 1),
            (0xD31E, 20),
            (0xD31F, 2),
            (0xD356, 0x01),
            (0xD057, 0),
            (0xD125, 1),
            (0xD730, 0x20),
            (0xD74B, 0x20),
            (0xD74E, 0x02),
            (0xD5F3, 0x01),
        ]
    )

    state = parse_pyboy_state(
        frame=123,
        rom_loaded=True,
        save_state_loaded=True,
        memory=memory,
    )

    assert state.map.id == 0
    assert state.map.name == "Pallet Town"
    assert state.player.name == "RED"
    assert state.player.tile == Position(x=5, y=6)
    assert state.player.facing == "up"
    assert state.party[0].species == "Squirtle"
    assert state.party[0].level == 5
    assert state.party[0].hp == 19
    assert state.party[0].max_hp == 19
    assert state.bag[0].name == "Potion"
    assert state.bag[0].quantity == 2
    assert state.badges.owned == ("Boulder",)
    assert state.battle.active is False
    assert state.dialog.active is True
    assert state.flags.values == {
        "hasPokedex": True,
        "hasOaksParcel": True,
        "hasTownMap": True,
    }
    assert "rich RAM parser pending real save-state calibration" not in state.parser_warnings


def test_parse_pyboy_state_names_viridian_forest_when_map_id_is_51() -> None:
    memory = FakeMemory([(0xD35E, 51)])

    state = parse_pyboy_state(
        frame=789,
        rom_loaded=True,
        save_state_loaded=True,
        memory=memory,
    )

    assert state.map.id == 51
    assert state.map.name == "Viridian Forest"
    assert state.collision.map_name == "Viridian Forest"
    assert "unknown map id 51" not in state.parser_warnings


def test_parse_pyboy_state_uses_indoor_tileset_collision_tiles() -> None:
    for map_id, tileset, expected_map in (
        (0x29, 0x06, "Viridian Pokecenter"),
        (0x2A, 0x02, "Viridian Mart"),
    ):
        entries: list[tuple[int, int]] = [
            (0xD35E, map_id),
            (0xD361, 3),
            (0xD362, 3),
            (ADDR_TILESET, tileset),
        ]
        for block_row in (3, 4, 5):
            for block_column in (3, 4, 5):
                tile_column = block_column * 2
                tile_row = (block_row * 2) + 1
                tile_address = ADDR_TILEMAP + (tile_row * TILEMAP_WIDTH) + tile_column
                entries.append((tile_address, 0x11))
        memory = FakeMemory(entries)

        state = parse_pyboy_state(
            frame=12,
            rom_loaded=True,
            save_state_loaded=True,
            memory=memory,
        )

        assert state.map.name == expected_map
        assert state.collision.passable_directions == ("up", "down", "left", "right")


def test_parse_pyboy_state_blocks_non_collision_tile_in_indoor_tilesets() -> None:
    entries: list[tuple[int, int]] = [
        (0xD35E, 0x29),
        (0xD361, 3),
        (0xD362, 3),
        (ADDR_TILESET, 0x06),
    ]
    for block_row in (3, 4, 5):
        for block_column in (3, 4, 5):
            tile_column = block_column * 2
            tile_row = (block_row * 2) + 1
            tile_address = ADDR_TILEMAP + (tile_row * TILEMAP_WIDTH) + tile_column
            entries.append((tile_address, 0x01))
    memory = FakeMemory(entries)

    state = parse_pyboy_state(
        frame=12,
        rom_loaded=True,
        save_state_loaded=True,
        memory=memory,
    )

    assert state.map.name == "Viridian Pokecenter"
    assert state.collision.passable_directions == ()


def test_parse_pyboy_state_prefers_runtime_tileset_collision_pointer() -> None:
    collision_pointer = 0x9000
    entries: list[tuple[int, int]] = [
        (0xD35E, 0x29),
        (0xD361, 3),
        (0xD362, 3),
        (ADDR_TILESET, 0x06),
        (ADDR_TILESET_COLLISION_PTR, collision_pointer & 0xFF),
        (ADDR_TILESET_COLLISION_PTR + 1, (collision_pointer >> 8) & 0xFF),
        (collision_pointer, 0x01),
        (collision_pointer + 1, 0x1A),
        (collision_pointer + 2, 0x1C),
        (collision_pointer + 3, 0x36),
        (collision_pointer + 4, 0x3C),
        (collision_pointer + 5, 0x5E),
        (collision_pointer + 6, 0x6D),
        (collision_pointer + 7, 0x6F),
        (collision_pointer + 8, 0xFF),
    ]
    for block_row in (3, 4, 5):
        for block_column in (3, 4, 5):
            tile_column = block_column * 2
            tile_row = (block_row * 2) + 1
            tile_address = ADDR_TILEMAP + (tile_row * TILEMAP_WIDTH) + tile_column
            entries.append((tile_address, 0x01))
    entries.append((ADDR_TILEMAP + (7 * TILEMAP_WIDTH) + 8, 0x1D))
    memory = FakeMemory(entries)

    state = parse_pyboy_state(
        frame=12,
        rom_loaded=True,
        save_state_loaded=True,
        memory=memory,
    )

    assert state.map.name == "Viridian Pokecenter"
    assert state.collision.passable_directions == ("down", "left", "right")


def test_parse_pyboy_state_applies_land_tile_pair_collisions() -> None:
    entries: list[tuple[int, int]] = [
        (0xD35E, 0x33),
        (0xD361, 3),
        (0xD362, 3),
        (ADDR_TILESET, 0x03),
    ]
    for block_row in (3, 4, 5):
        for block_column in (3, 4, 5):
            tile_column = block_column * 2
            tile_row = (block_row * 2) + 1
            tile_address = ADDR_TILEMAP + (tile_row * TILEMAP_WIDTH) + tile_column
            entries.append((tile_address, 0x1E))
    entries.append((ADDR_TILEMAP + (9 * TILEMAP_WIDTH) + 8, 0x30))
    entries.append((ADDR_TILEMAP + (7 * TILEMAP_WIDTH) + 8, 0x2E))
    memory = FakeMemory(entries)

    state = parse_pyboy_state(
        frame=12,
        rom_loaded=True,
        save_state_loaded=True,
        memory=memory,
    )

    assert state.map.name == "Viridian Forest"
    assert state.collision.passable_directions == ("down", "left", "right")


def test_all_vanilla_pret_pokered_map_ids_have_names() -> None:
    unnamed_ids = [
        map_id
        for map_id in VANILLA_MAP_IDS
        if map_name(map_id).startswith("Unknown Map")
    ]

    assert len(MAP_NAMES) == len(VANILLA_MAP_IDS)
    assert unnamed_ids == []


def test_parse_pyboy_state_clamps_invalid_ram_and_warns() -> None:
    memory = FakeMemory(
        [
            (0xD35E, 250),
            (0xD361, 255),
            (0xD362, 254),
            (0xC109, 0xFF),
            (0xD163, 250),
            (0xD31D, 250),
            (0xD31E, 250),
            (0xD31F, 99),
        ]
    )

    state = parse_pyboy_state(
        frame=456,
        rom_loaded=True,
        save_state_loaded=False,
        memory=memory,
    )

    assert state.map.name == "Unknown Map (250)"
    assert state.player.tile == Position(x=254, y=255)
    assert state.player.facing == "unknown(0xFF)"
    assert len(state.party) <= 6
    assert len(state.bag) <= 20
    assert "party count 250 clamped to 6" in state.parser_warnings
    assert "bag count 250 clamped to 20" in state.parser_warnings
    assert "unknown facing byte 0xFF" in state.parser_warnings
