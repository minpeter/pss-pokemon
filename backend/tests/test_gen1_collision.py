from collections.abc import Iterable
from typing import override

from pokemon_harness.gen1_collision import (
    ADDR_TILEMAP,
    ADDR_TILEMAP_BACKUP,
    ADDR_TILESET,
    ADDR_TILESET_COLLISION_PTR,
    TILEMAP_WIDTH,
    TILESET_WALKABLE,
    collision_from_memory,
)
from pokemon_harness.schemas import Position


class FakeMemory:
    def __init__(self, entries: Iterable[tuple[int, int]]) -> None:
        self._bytes: dict[int, int] = dict(entries)

    def __getitem__(self, address: int) -> int:
        return self._bytes.get(address, 0)


class StrictMemory(FakeMemory):
    @override
    def __getitem__(self, address: int) -> int:
        if not 0 <= address <= 0xFFFF:
            raise IndexError(hex(address))
        return super().__getitem__(address)


EXPECTED_TILESET_WALKABLE: dict[int, frozenset[int]] = {
    0: frozenset({
        0x00, 0x10, 0x1B, 0x20, 0x21, 0x23, 0x2C, 0x2D, 0x2E, 0x30,
        0x31, 0x33, 0x39, 0x3C, 0x3E, 0x52, 0x54, 0x58, 0x5B,
    }),
    1: frozenset({0x01, 0x02, 0x03, 0x11, 0x12, 0x13, 0x14, 0x1A, 0x1C}),
    2: frozenset({0x11, 0x1A, 0x1C, 0x3C, 0x5E}),
    3: frozenset({
        0x1E, 0x20, 0x2E, 0x30, 0x34, 0x37, 0x39, 0x3A,
        0x40, 0x51, 0x52, 0x5A, 0x5C, 0x5E, 0x5F,
    }),
    4: frozenset({0x01, 0x02, 0x03, 0x11, 0x12, 0x13, 0x14, 0x1A, 0x1C}),
    5: frozenset({0x03, 0x11, 0x16, 0x19, 0x2B, 0x3C, 0x3D, 0x3F, 0x4A, 0x4C, 0x4D}),
    6: frozenset({0x11, 0x1A, 0x1C, 0x3C, 0x5E}),
    7: frozenset({0x03, 0x11, 0x16, 0x19, 0x2B, 0x3C, 0x3D, 0x3F, 0x4A, 0x4C, 0x4D}),
    8: frozenset({0x01, 0x12, 0x14, 0x28, 0x32, 0x37, 0x44, 0x54, 0x5C}),
    9: frozenset({0x01, 0x12, 0x14, 0x1A, 0x1C, 0x37, 0x38, 0x3B, 0x3C, 0x5E}),
    10: frozenset({0x01, 0x12, 0x14, 0x1A, 0x1C, 0x37, 0x38, 0x3B, 0x3C, 0x5E}),
    11: frozenset({0x0B, 0x0C, 0x13, 0x15, 0x18}),
    12: frozenset({0x01, 0x12, 0x14, 0x1A, 0x1C, 0x37, 0x38, 0x3B, 0x3C, 0x5E}),
    13: frozenset({0x04, 0x0D, 0x17, 0x1D, 0x1E, 0x23, 0x34, 0x37, 0x39, 0x4A}),
    14: frozenset({0x0A, 0x1A, 0x32, 0x3B}),
    15: frozenset({0x01, 0x10, 0x13, 0x1B, 0x22, 0x42, 0x52}),
    16: frozenset({0x04, 0x0F, 0x15, 0x1F, 0x3B, 0x45, 0x47, 0x55, 0x56}),
    17: frozenset({0x05, 0x15, 0x18, 0x1A, 0x20, 0x21, 0x22, 0x2A, 0x2D, 0x30}),
    18: frozenset({0x14, 0x17, 0x1A, 0x1C, 0x20, 0x38, 0x45}),
    19: frozenset({0x01, 0x05, 0x11, 0x12, 0x14, 0x1A, 0x1C, 0x2C, 0x53}),
    20: frozenset({0x0C, 0x16, 0x1E, 0x26, 0x34, 0x37}),
    21: frozenset({0x0F, 0x1A, 0x1F, 0x26, 0x28, 0x29, 0x2C, 0x2D, 0x2E, 0x2F, 0x41}),
    22: frozenset({
        0x01, 0x10, 0x11, 0x13, 0x1B, 0x20, 0x21, 0x22, 0x30,
        0x31, 0x32, 0x42, 0x43, 0x48, 0x52, 0x55, 0x58, 0x5E,
    }),
    23: frozenset({0x1B, 0x23, 0x2C, 0x2D, 0x3B, 0x45}),
}


def test_tileset_walkable_table_matches_pret_pokered_collision_data() -> None:
    assert TILESET_WALKABLE == EXPECTED_TILESET_WALKABLE


def test_collision_uses_backup_tilemap_when_visible_tilemap_has_textbox_tiles() -> None:
    collision_pointer = 0x9000
    cell_row = 4
    cell_column = 5
    tile_column = cell_column * 2
    tile_row = (cell_row * 2) + 1
    tile_address = ADDR_TILEMAP + (tile_row * TILEMAP_WIDTH) + tile_column
    backup_address = ADDR_TILEMAP_BACKUP + (tile_row * TILEMAP_WIDTH) + tile_column
    memory = FakeMemory(
        [
            (ADDR_TILESET, 0x06),
            (ADDR_TILESET_COLLISION_PTR, collision_pointer & 0xFF),
            (ADDR_TILESET_COLLISION_PTR + 1, (collision_pointer >> 8) & 0xFF),
            (collision_pointer, 0x01),
            (collision_pointer + 1, 0xFF),
            (tile_address, 0x7F),
            (backup_address, 0x01),
        ]
    )

    state = collision_from_memory(
        map_id=0x29,
        map_name="Viridian Pokecenter",
        player_tile=Position(x=3, y=3),
        memory=memory,
    )

    assert state.grid[cell_row][cell_column] is True


def test_collision_keeps_runtime_walkable_high_tile_before_backup() -> None:
    collision_pointer = 0x9000
    cell_row = 4
    cell_column = 5
    tile_column = cell_column * 2
    tile_row = (cell_row * 2) + 1
    tile_address = ADDR_TILEMAP + (tile_row * TILEMAP_WIDTH) + tile_column
    backup_address = ADDR_TILEMAP_BACKUP + (tile_row * TILEMAP_WIDTH) + tile_column
    memory = FakeMemory(
        [
            (ADDR_TILESET, 0x06),
            (ADDR_TILESET_COLLISION_PTR, collision_pointer & 0xFF),
            (ADDR_TILESET_COLLISION_PTR + 1, (collision_pointer >> 8) & 0xFF),
            (collision_pointer, 0x6D),
            (collision_pointer + 1, 0xFF),
            (tile_address, 0x6D),
            (backup_address, 0x00),
        ]
    )

    state = collision_from_memory(
        map_id=0x29,
        map_name="Viridian Pokecenter",
        player_tile=Position(x=3, y=3),
        memory=memory,
    )

    assert state.grid[cell_row][cell_column] is True


def test_collision_falls_back_when_runtime_collision_pointer_crosses_address_space() -> None:
    collision_pointer = 0xFFF0
    cell_row = 4
    cell_column = 5
    tile_column = cell_column * 2
    tile_row = (cell_row * 2) + 1
    tile_address = ADDR_TILEMAP + (tile_row * TILEMAP_WIDTH) + tile_column
    memory = StrictMemory(
        [
            (ADDR_TILESET, 0x06),
            (ADDR_TILESET_COLLISION_PTR, collision_pointer & 0xFF),
            (ADDR_TILESET_COLLISION_PTR + 1, (collision_pointer >> 8) & 0xFF),
            (tile_address, 0x11),
        ]
    )

    state = collision_from_memory(
        map_id=0x29,
        map_name="Viridian Pokecenter",
        player_tile=Position(x=3, y=3),
        memory=memory,
    )

    assert state.grid[cell_row][cell_column] is True
