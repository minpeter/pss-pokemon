from pathlib import Path

import pytest

from pokemon_harness.config import HarnessSettings, PreflightError


def test_settings_preflight_fails_when_rom_and_save_state_are_missing() -> None:
    settings = HarnessSettings(rom_path=None, save_state_path=None)

    with pytest.raises(PreflightError, match="POKEMON_ROM_PATH"):
        _ = settings.require_real_rom_paths()


def test_settings_preflight_accepts_existing_rom_and_save_state(tmp_path: Path) -> None:
    rom_path = tmp_path / "pokemon.gb"
    save_state_path = tmp_path / "pallet.state"
    _ = rom_path.write_bytes(b"rom")
    _ = save_state_path.write_bytes(b"state")
    settings = HarnessSettings(rom_path=rom_path, save_state_path=save_state_path)

    paths = settings.require_real_rom_paths()

    assert paths.rom_path == rom_path
    assert paths.save_state_path == save_state_path


def test_settings_preflight_accepts_existing_rom_without_save_state(tmp_path: Path) -> None:
    rom_path = tmp_path / "pokemon.gb"
    _ = rom_path.write_bytes(b"rom")
    settings = HarnessSettings(rom_path=rom_path, save_state_path=None)

    paths = settings.require_real_rom_paths()

    assert paths.rom_path == rom_path
    assert paths.save_state_path is None


def test_preflight_error_allows_traceback_assignment() -> None:
    error = PreflightError("missing rom")

    error.__traceback__ = None

    assert str(error) == "missing rom"
