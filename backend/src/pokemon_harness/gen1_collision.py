from typing import Final, Protocol

from pokemon_harness.schemas import CollisionState, Position

ADDR_TILEMAP: Final = 0xC3A0
ADDR_TILEMAP_BACKUP: Final = 0xC508
ADDR_TILESET: Final = 0xD367
ADDR_TILESET_COLLISION_PTR: Final = 0xD530
TILEMAP_WIDTH: Final = 20
TILEMAP_HEIGHT: Final = 18
BLOCK_COLUMNS: Final = 10
BLOCK_ROWS: Final = 9
PLAYER_COLUMN: Final = 4
PLAYER_ROW: Final = 4
COL_LABELS: Final = "ABCDEFGHIJ"
PLAYER_CELL: Final = "E5"
MAX_RUNTIME_COLLISION_TILES: Final = 128
COLLISION_LIST_TERMINATOR: Final = 0xFF
MAP_TILESET_SIZE: Final = 0x60
MAX_GAME_BOY_ADDRESS: Final = 0xFFFF

TILESET_WALKABLE: Final[dict[int, frozenset[int]]] = {
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
TILE_PAIR_COLLISIONS_LAND: Final[dict[int, frozenset[frozenset[int]]]] = {
    3: frozenset({
        frozenset({0x20, 0x2E}),
        frozenset({0x30, 0x2E}),
        frozenset({0x52, 0x2E}),
        frozenset({0x55, 0x2E}),
        frozenset({0x56, 0x2E}),
        frozenset({0x5E, 0x2E}),
        frozenset({0x5F, 0x2E}),
    }),
    17: frozenset({
        frozenset({0x05, 0x20}),
        frozenset({0x05, 0x21}),
        frozenset({0x05, 0x2A}),
        frozenset({0x05, 0x41}),
    }),
}


class CollisionMemory(Protocol):
    def __getitem__(self, address: int) -> int: ...


def collision_from_memory(
    *,
    map_id: int | None,
    map_name: str | None,
    player_tile: Position | None,
    memory: CollisionMemory,
) -> CollisionState:
    tileset = memory[ADDR_TILESET]
    walkable_tiles = _walkable_tiles(memory=memory, tileset=tileset)
    grid = _walkable_grid(memory=memory, tileset=tileset, walkable_tiles=walkable_tiles)
    directions = _passable_directions(grid)
    ascii_map = render_ascii_map(grid)
    return CollisionState(
        mapId=map_id,
        mapName=map_name,
        width=BLOCK_COLUMNS,
        height=BLOCK_ROWS,
        grid=grid,
        playerTile=player_tile,
        passableDirections=directions,
        ascii=ascii_map,
        playerCell=PLAYER_CELL,
    )


def _walkable_tiles(*, memory: CollisionMemory, tileset: int) -> frozenset[int]:
    runtime_tiles = _runtime_walkable_tiles(memory)
    if runtime_tiles is not None:
        return runtime_tiles
    return TILESET_WALKABLE.get(tileset, frozenset())


def _runtime_walkable_tiles(memory: CollisionMemory) -> frozenset[int] | None:
    low_byte = memory[ADDR_TILESET_COLLISION_PTR] & 0xFF
    high_byte = memory[ADDR_TILESET_COLLISION_PTR + 1] & 0xFF
    pointer = low_byte | (high_byte << 8)
    if pointer == 0:
        return None

    tiles: list[int] = []
    for offset in range(MAX_RUNTIME_COLLISION_TILES):
        address = pointer + offset
        if address > MAX_GAME_BOY_ADDRESS:
            return None
        tile_id = memory[address] & 0xFF
        if tile_id == COLLISION_LIST_TERMINATOR:
            return frozenset(tiles)
        tiles.append(tile_id)
    return None


def render_ascii_map(grid: tuple[tuple[bool, ...], ...]) -> str:
    lines = [f"  {' '.join(COL_LABELS)}"]
    for row_index, row in enumerate(grid):
        cells: list[str] = []
        for column_index, passable in enumerate(row):
            if row_index == PLAYER_ROW and column_index == PLAYER_COLUMN:
                cells.append("@")
            else:
                cells.append("." if passable else "#")
        lines.append(f"{row_index + 1:>2} {' '.join(cells)}")
    lines.append("")
    lines.append("@ you (E5) . walkable # blocked")
    lines.append("up=row-1 down=row+1 left=col-1 right=col+1")
    return "\n".join(lines)


def _walkable_grid(
    *,
    memory: CollisionMemory,
    tileset: int,
    walkable_tiles: frozenset[int],
) -> tuple[tuple[bool, ...], ...]:
    rows: list[tuple[bool, ...]] = []
    for block_row in range(BLOCK_ROWS):
        row: list[bool] = []
        for block_column in range(BLOCK_COLUMNS):
            tile_id = _tile_id_for_cell(
                memory=memory,
                row=block_row,
                column=block_column,
                walkable_tiles=walkable_tiles,
            )
            row.append(tile_id in walkable_tiles)
        rows.append(tuple(row))
    grid = list(rows)
    center = list(grid[PLAYER_ROW])
    center[PLAYER_COLUMN] = True
    grid[PLAYER_ROW] = tuple(center)
    _apply_tile_pair_collisions(
        memory=memory,
        tileset=tileset,
        walkable_tiles=walkable_tiles,
        grid=grid,
    )
    return tuple(grid)


def _tile_id_for_cell(
    *,
    memory: CollisionMemory,
    row: int,
    column: int,
    walkable_tiles: frozenset[int],
) -> int:
    tile_column = column * 2
    tile_row = (row * 2) + 1
    offset = (tile_row * TILEMAP_WIDTH) + tile_column
    tile_id = memory[ADDR_TILEMAP + offset]
    if tile_id < MAP_TILESET_SIZE or tile_id in walkable_tiles:
        return tile_id
    return memory[ADDR_TILEMAP_BACKUP + offset]


def _apply_tile_pair_collisions(
    *,
    memory: CollisionMemory,
    tileset: int,
    walkable_tiles: frozenset[int],
    grid: list[tuple[bool, ...]],
) -> None:
    blocked_pairs = TILE_PAIR_COLLISIONS_LAND.get(tileset, frozenset())
    if not blocked_pairs:
        return

    standing_tile = _tile_id_for_cell(
        memory=memory,
        row=PLAYER_ROW,
        column=PLAYER_COLUMN,
        walkable_tiles=walkable_tiles,
    )
    for _, row, column in _direction_candidates():
        destination_tile = _tile_id_for_cell(
            memory=memory,
            row=row,
            column=column,
            walkable_tiles=walkable_tiles,
        )
        if frozenset({standing_tile, destination_tile}) in blocked_pairs:
            updated_row = list(grid[row])
            updated_row[column] = False
            grid[row] = tuple(updated_row)


def _passable_directions(grid: tuple[tuple[bool, ...], ...]) -> tuple[str, ...]:
    return tuple(
        direction
        for direction, row, column in _direction_candidates()
        if grid[row][column]
    )


def _direction_candidates() -> tuple[tuple[str, int, int], ...]:
    return (
        ("up", PLAYER_ROW - 1, PLAYER_COLUMN),
        ("down", PLAYER_ROW + 1, PLAYER_COLUMN),
        ("left", PLAYER_ROW, PLAYER_COLUMN - 1),
        ("right", PLAYER_ROW, PLAYER_COLUMN + 1),
    )
