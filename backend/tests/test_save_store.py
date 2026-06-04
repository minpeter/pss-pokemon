from pathlib import Path

import pytest

from pokemon_harness.save_store import DuplicateSaveError, InvalidSaveNameError, SaveStore


def test_save_store_rejects_unsafe_names(tmp_path: Path) -> None:
    store = SaveStore(root=tmp_path)

    with pytest.raises(InvalidSaveNameError, match="unsafe save name"):
        _ = store.path_for("../escape")


def test_save_store_rejects_duplicate_without_overwrite(tmp_path: Path) -> None:
    store = SaveStore(root=tmp_path)
    source = tmp_path / "source.state"
    _ = source.write_bytes(b"state")
    _ = store.save_from_file(name="qa-smoke", source=source, overwrite=False)

    with pytest.raises(DuplicateSaveError, match="already exists"):
        _ = store.save_from_file(name="qa-smoke", source=source, overwrite=False)


def test_save_store_overwrites_when_explicit(tmp_path: Path) -> None:
    store = SaveStore(root=tmp_path)
    source = tmp_path / "source.state"
    _ = source.write_bytes(b"state-v1")
    _ = store.save_from_file(name="qa-smoke", source=source, overwrite=False)
    _ = source.write_bytes(b"state-v2")

    saved = store.save_from_file(name="qa-smoke", source=source, overwrite=True)

    assert saved.path.read_bytes() == b"state-v2"
