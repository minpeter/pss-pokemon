"""Generate a Gen-1 Red/Blue save state that starts in the overworld.

A cold ROM boot drops the player at the title screen and, on the Korean and
Japanese builds, a name-entry screen that plain A-mashing cannot confirm. This
best-effort tool boots the ROM, drives through the intro (confirming names with
START once the entry field stops changing), and writes a PyBoy save state once
the player has overworld control. Point POKEMON_SAVE_STATE_PATH at the result to
start runs in-game instead of at a black boot frame.

Save states are ROM-derived; keep them out of version control (see .gitignore).

Usage:
    uv run python -m pokemon_harness.make_intro_save_state \
        --rom /path/to/pokemon.gb --out .local/savestates/intro-done.state
"""

import argparse
import hashlib
import os
import sys
from io import BytesIO
from pathlib import Path
from typing import Final

from pokemon_harness.pyboy_emulator import BOOT_WARMUP_FRAMES, PyBoyLike, create_pyboy
from pokemon_harness.state_parser import parse_pyboy_state

_PRESS_FRAMES: Final = 8
_WAIT_FRAMES: Final = 36
_MAX_INTRO_STEPS: Final = 160
_STUCK_THRESHOLD: Final = 3
_MOVE_CHECK_INTERVAL: Final = 8
_DEFAULT_OUT: Final = ".local/savestates/redblue-intro-done.state"

_Position = tuple[int | None, int | None, int | None]


def _advance(pyboy: PyBoyLike, frames: int) -> None:
    for _ in range(frames):
        _ = pyboy.tick()


def _press(pyboy: PyBoyLike, button: str, frame: int) -> int:
    pyboy.button(button, delay=_PRESS_FRAMES)
    _advance(pyboy, _PRESS_FRAMES + _WAIT_FRAMES)
    return frame + _PRESS_FRAMES + _WAIT_FRAMES


def _screen_hash(pyboy: PyBoyLike) -> str:
    image = pyboy.screen.image
    if image is None:
        return ""
    buffer = BytesIO()
    image.save(buffer, "PNG")
    return hashlib.md5(buffer.getvalue(), usedforsecurity=False).hexdigest()


def _position(pyboy: PyBoyLike, frame: int) -> _Position:
    state = parse_pyboy_state(
        frame=frame, rom_loaded=True, save_state_loaded=False, memory=pyboy.memory
    )
    tile = state.player.tile
    if tile is None:
        return (state.map.id, None, None)
    return (state.map.id, tile.x, tile.y)


def _moved(before: _Position, after: _Position) -> bool:
    return after[1] is not None and after != before


def _drive_to_overworld(pyboy: PyBoyLike) -> tuple[bool, int]:
    _advance(pyboy, BOOT_WARMUP_FRAMES)
    frame = _press(pyboy, "start", 0)
    frame = _press(pyboy, "a", frame)
    stuck = 0
    for step in range(_MAX_INTRO_STEPS):
        before = _screen_hash(pyboy)
        frame = _press(pyboy, "a", frame)
        stuck = stuck + 1 if _screen_hash(pyboy) == before else 0
        if stuck >= _STUCK_THRESHOLD:
            # A filled the name field and it stopped changing: START jumps to the
            # END cell, then A confirms the name (player, then rival).
            frame = _press(pyboy, "start", frame)
            frame = _press(pyboy, "a", frame)
            frame = _press(pyboy, "a", frame)
            stuck = 0
        if step % _MOVE_CHECK_INTERVAL == _MOVE_CHECK_INTERVAL - 1:
            before_pos = _position(pyboy, frame)
            frame = _press(pyboy, "down", frame)
            if _moved(before_pos, _position(pyboy, frame)):
                return (True, frame)
    return (False, frame)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an overworld save state.")
    _ = parser.add_argument("--rom", default=os.environ.get("POKEMON_ROM_PATH"))
    _ = parser.add_argument("--out", default=_DEFAULT_OUT)
    args = parser.parse_args()
    if not args.rom:
        _ = sys.stderr.write("POKEMON_ROM_PATH or --rom is required\n")
        raise SystemExit(2)
    rom_path = Path(args.rom)
    if not rom_path.is_file():
        _ = sys.stderr.write(f"ROM not found: {rom_path}\n")
        raise SystemExit(1)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pyboy = create_pyboy(rom_path)
    try:
        reached, frame = _drive_to_overworld(pyboy)
        position = _position(pyboy, frame)
        buffer = BytesIO()
        pyboy.save_state(buffer)
        _ = out_path.write_bytes(buffer.getvalue())
    finally:
        pyboy.stop(save=False)
    status = "overworld" if reached else "intro (overworld not detected)"
    _ = sys.stdout.write(
        f"saved {out_path} at map {position[0]} tile {position[1]},{position[2]} [{status}]\n"
    )
    if not reached:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
