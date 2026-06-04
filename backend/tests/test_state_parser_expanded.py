from collections.abc import Iterable
from dataclasses import dataclass

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


def bcd(address: int, value: int) -> list[tuple[int, int]]:
    digits = f"{value:06d}"
    return [
        (address + offset, (int(digits[offset * 2]) << 4) | int(digits[(offset * 2) + 1]))
        for offset in range(3)
    ]


def set_bits(address: int, indexes: Iterable[int]) -> list[tuple[int, int]]:
    bytes_by_offset: dict[int, int] = {}
    for index in indexes:
        offset = index // 8
        bytes_by_offset[offset] = bytes_by_offset.get(offset, 0) | (1 << (index % 8))
    return [(address + offset, value) for offset, value in bytes_by_offset.items()]


@dataclass(frozen=True, slots=True)
class PokemonData:
    species: int
    hp: int
    status: int
    types: tuple[int, int]
    moves: tuple[int, int, int, int]
    level: int
    max_hp: int
    stats: tuple[int, int, int, int]


def pokemon_data(address: int, fixture: PokemonData) -> list[tuple[int, int]]:
    data = [0] * 44
    data[0] = fixture.species
    data[1] = (fixture.hp >> 8) & 0xFF
    data[2] = fixture.hp & 0xFF
    data[4] = fixture.status
    data[5] = fixture.types[0]
    data[6] = fixture.types[1]
    for index, move_id in enumerate(fixture.moves):
        data[8 + index] = move_id
    data[33] = fixture.level
    data[34] = (fixture.max_hp >> 8) & 0xFF
    data[35] = fixture.max_hp & 0xFF
    for index, stat in enumerate(fixture.stats):
        base = 36 + (index * 2)
        data[base] = (stat >> 8) & 0xFF
        data[base + 1] = stat & 0xFF
    return [(address + offset, value) for offset, value in enumerate(data)]


def test_parse_pyboy_state_reads_expanded_player_party_and_battle_details() -> None:
    memory = FakeMemory(
        [
            *encoded_text(0xD158, "RED"),
            *encoded_text(0xD34A, "BLUE"),
            *bcd(0xD347, 123456),
            (0xDA40, 0x00),
            (0xDA41, 0x02),
            (0xDA42, 3),
            (0xDA43, 4),
            *set_bits(0xD2F7, range(3)),
            *set_bits(0xD30A, range(5)),
            (0xD35E, 0),
            (0xD361, 6),
            (0xD362, 5),
            (0xC109, 0x04),
            (0xD163, 1),
            *pokemon_data(
                0xD16B,
                PokemonData(
                    species=177,
                    hp=19,
                    status=0,
                    types=(21, 21),
                    moves=(33, 39, 55, 0),
                    level=5,
                    max_hp=19,
                    stats=(12, 11, 10, 9),
                ),
            ),
            *encoded_text(0xD2B5, "SHELLY"),
            (0xD057, 1),
            (0xD89D, 176),
            *pokemon_data(
                0xD8A4,
                PokemonData(
                    species=176,
                    hp=12,
                    status=0x08,
                    types=(20, 20),
                    moves=(10, 45, 52, 0),
                    level=4,
                    max_hp=17,
                    stats=(9, 8, 10, 8),
                ),
            ),
        ]
    )

    state = parse_pyboy_state(
        frame=789,
        rom_loaded=True,
        save_state_loaded=True,
        memory=memory,
    )

    assert state.player.rival_name == "BLUE"
    assert state.player.money == 123456
    assert state.player.play_time == "2:03:04"
    assert state.player.pokedex_owned == 3
    assert state.player.pokedex_seen == 5
    assert state.party[0].nickname == "SHELLY"
    assert state.party[0].types == ("Water",)
    assert state.party[0].moves == ("Tackle", "Tail Whip", "Water Gun")
    assert state.party[0].stats is not None
    assert state.party[0].stats.attack == 12
    assert state.party[0].stats.defense == 11
    assert state.party[0].stats.speed == 10
    assert state.party[0].stats.special == 9
    assert state.battle.enemy is not None
    assert state.battle.enemy.species == "Charmander"
    assert state.battle.enemy.level == 4
    assert state.battle.enemy.hp == 12
    assert state.battle.enemy.max_hp == 17
    assert state.battle.enemy.status == "PSN"
    assert state.battle.enemy.moves == ("Scratch", "Growl", "Ember")
    assert state.parser_warnings == ()


def test_parse_pyboy_state_handles_expanded_invalid_ram_without_crashing() -> None:
    memory = FakeMemory(
        [
            (0xD347, 0xFA),
            (0xD348, 0xBC),
            (0xD349, 0xDE),
            (0xD163, 1),
            *pokemon_data(
                0xD16B,
                PokemonData(
                    species=177,
                    hp=1,
                    status=0,
                    types=(99, 99),
                    moves=(250, 0, 0, 0),
                    level=5,
                    max_hp=1,
                    stats=(0, 0, 0, 0),
                ),
            ),
        ]
    )

    state = parse_pyboy_state(
        frame=790,
        rom_loaded=True,
        save_state_loaded=True,
        memory=memory,
    )

    assert state.player.money is None
    assert state.party[0].types == ("???(99)",)
    assert state.party[0].moves == ("???(250)",)
    assert "invalid money BCD byte 0xFA" in state.parser_warnings
    assert "unknown type byte 99" in state.parser_warnings
    assert "unknown move byte 250" in state.parser_warnings
