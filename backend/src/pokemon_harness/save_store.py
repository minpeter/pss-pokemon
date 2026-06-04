import re
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import override

from pokemon_harness.schemas import SaveEntryResponse

SAVE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


@dataclass(frozen=True, slots=True)
class InvalidSaveNameError(Exception):
    name: str

    @override
    def __str__(self) -> str:
        return f"unsafe save name: {self.name}"


@dataclass(frozen=True, slots=True)
class DuplicateSaveError(Exception):
    name: str

    @override
    def __str__(self) -> str:
        return f"save already exists: {self.name}"


@dataclass(frozen=True, slots=True)
class MissingSaveError(Exception):
    name: str

    @override
    def __str__(self) -> str:
        return f"save does not exist: {self.name}"


@dataclass(frozen=True, slots=True)
class SavedState:
    name: str
    path: Path


@dataclass(frozen=True, slots=True)
class SaveStore:
    root: Path

    def path_for(self, name: str) -> Path:
        if SAVE_NAME_PATTERN.fullmatch(name) is None:
            raise InvalidSaveNameError(name=name)
        return self.root / f"{name}.state"

    def list(self) -> tuple[SaveEntryResponse, ...]:
        if not self.root.exists():
            return ()
        entries: list[SaveEntryResponse] = []
        for path in sorted(self.root.glob("*.state")):
            stat = path.stat()
            entries.append(
                SaveEntryResponse(
                    name=path.stem,
                    createdAt=datetime.fromtimestamp(stat.st_ctime, tz=UTC),
                    updatedAt=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
                )
            )
        return tuple(entries)

    def save_from_file(self, name: str, source: Path, *, overwrite: bool) -> SavedState:
        destination = self.path_for(name)
        self._ensure_can_write(destination=destination, name=name, overwrite=overwrite)
        self.root.mkdir(parents=True, exist_ok=True)
        _ = shutil.copyfile(source, destination)
        return SavedState(name=name, path=destination)

    def save_bytes(self, name: str, payload: bytes, *, overwrite: bool) -> SavedState:
        destination = self.path_for(name)
        self._ensure_can_write(destination=destination, name=name, overwrite=overwrite)
        self.root.mkdir(parents=True, exist_ok=True)
        _ = destination.write_bytes(payload)
        return SavedState(name=name, path=destination)

    def require(self, name: str) -> SavedState:
        path = self.path_for(name)
        if not path.is_file():
            raise MissingSaveError(name=name)
        return SavedState(name=name, path=path)

    @staticmethod
    def _ensure_can_write(destination: Path, name: str, *, overwrite: bool) -> None:
        if destination.exists() and not overwrite:
            raise DuplicateSaveError(name=name)
