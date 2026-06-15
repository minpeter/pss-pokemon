from io import BytesIO
from pathlib import Path
from typing import BinaryIO, final

from pokemon_harness.pyboy_emulator import (
    BOOT_WARMUP_FRAMES,
    PyBoyEmulator,
    PyBoyImage,
    PyBoyMemory,
    PyBoyScreen,
)


@final
class _FakeImage:
    width = 160
    height = 144

    def save(self, fp: BytesIO, image_format: str) -> None:
        _ = (fp, image_format)


@final
class _FakeScreen:
    @property
    def image(self) -> PyBoyImage | None:
        return _FakeImage()


@final
class _FakeMemory:
    def __getitem__(self, address: int) -> int:
        return address & 0xFF


@final
class _FakePyBoy:
    def __init__(self) -> None:
        self.tick_count: int = 0
        self.load_state_calls: int = 0
        self.screen: PyBoyScreen = _FakeScreen()
        self.memory: PyBoyMemory = _FakeMemory()

    def load_state(self, file_like_object: BinaryIO | BytesIO) -> None:
        _ = file_like_object
        self.load_state_calls += 1

    def button(self, button_input: str, delay: int = 1) -> None:
        _ = (button_input, delay)

    def save_state(self, file_like_object: BytesIO) -> None:
        _ = file_like_object

    def stop(self, save: bool = True) -> None:
        _ = save

    def tick(self) -> bool:
        self.tick_count += 1
        return True


def test_cold_boot_warms_up_past_black_frame() -> None:
    fake = _FakePyBoy()
    emulator = PyBoyEmulator(rom_path=Path("unused.gb"), save_state_path=None, pyboy=fake)
    assert fake.tick_count == BOOT_WARMUP_FRAMES
    assert emulator.frame == 0
    assert emulator.save_state_loaded is False


def test_initial_save_state_skips_warmup(tmp_path: Path) -> None:
    state_path = tmp_path / "start.state"
    _ = state_path.write_bytes(b"snapshot")
    fake = _FakePyBoy()
    emulator = PyBoyEmulator(rom_path=Path("unused.gb"), save_state_path=state_path, pyboy=fake)
    assert fake.tick_count == 0
    assert fake.load_state_calls == 1
    assert emulator.save_state_loaded is True
