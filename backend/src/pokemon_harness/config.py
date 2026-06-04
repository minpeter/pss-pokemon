from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar, override

from pydantic_settings import BaseSettings, SettingsConfigDict


@dataclass(frozen=True, slots=True)
class RealRomPaths:
    rom_path: Path
    save_state_path: Path | None


class PreflightError(Exception):
    message: str

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message

    @override
    def __str__(self) -> str:
        return self.message


class HarnessSettings(BaseSettings):
    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=".env",
        env_prefix="POKEMON_",
    )

    rom_path: Path | None = None
    save_state_path: Path | None = None
    host: str = "127.0.0.1"
    port: int = 8765

    def require_real_rom_paths(self) -> RealRomPaths:
        if self.rom_path is None:
            message = "POKEMON_ROM_PATH is required for real-ROM verification"
            raise PreflightError(message)
        if not self.rom_path.is_file():
            message = f"POKEMON_ROM_PATH does not exist: {self.rom_path}"
            raise PreflightError(message)
        if self.save_state_path is not None and not self.save_state_path.is_file():
            message = f"POKEMON_SAVE_STATE_PATH does not exist: {self.save_state_path}"
            raise PreflightError(message)
        return RealRomPaths(rom_path=self.rom_path, save_state_path=self.save_state_path)
