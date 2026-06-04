import importlib
from base64 import b64encode
from io import BytesIO
from pathlib import Path
from typing import BinaryIO, Final, Protocol

from pokemon_harness.fake_emulator import ONE_PIXEL_PNG
from pokemon_harness.schemas import (
    ActionRequest,
    ButtonStep,
    GameState,
    HoldStep,
    Observation,
    Screenshot,
    TextSkipUntilDialogEndStep,
    WaitStep,
    WalkStep,
)
from pokemon_harness.state_parser import parse_pyboy_state

BUTTON_NAME_MAP: Final[dict[str, str]] = {
    "up": "up",
    "down": "down",
    "left": "left",
    "right": "right",
    "a": "a",
    "b": "b",
    "start": "start",
    "select": "select",
}


class PyBoyImage(Protocol):
    width: int
    height: int

    def save(self, fp: BytesIO, image_format: str) -> None: ...


class PyBoyScreen(Protocol):
    @property
    def image(self) -> PyBoyImage | None: ...


class PyBoyMemory(Protocol):
    def __getitem__(self, address: int) -> int: ...


class PyBoyLike(Protocol):
    screen: PyBoyScreen
    memory: PyBoyMemory

    def load_state(self, file_like_object: BinaryIO | BytesIO) -> None: ...

    def button(self, button_input: str, delay: int = 1) -> None: ...

    def save_state(self, file_like_object: BytesIO) -> None: ...

    def stop(self, save: bool = True) -> None: ...

    def tick(self) -> bool: ...


class PyBoyEmulator:
    def __init__(self, rom_path: Path, save_state_path: Path | None) -> None:
        pyboy_module = importlib.import_module("pyboy")
        pyboy_class = pyboy_module.PyBoy
        self._pyboy: PyBoyLike = pyboy_class(str(rom_path), window="null")
        self._frame: int = 0
        self._initial_save_state_path: Path | None = save_state_path
        self._save_state_loaded: bool = False
        if save_state_path is not None:
            with save_state_path.open("rb") as save_state:
                self._pyboy.load_state(save_state)
            self._save_state_loaded = True

    @property
    def frame(self) -> int:
        return self._frame

    @property
    def rom_loaded(self) -> bool:
        return True

    @property
    def save_state_loaded(self) -> bool:
        return self._save_state_loaded

    def state(self) -> GameState:
        return parse_pyboy_state(
            frame=self._frame,
            rom_loaded=True,
            save_state_loaded=self._save_state_loaded,
            memory=self._pyboy.memory,
        )

    def screenshot_png(self) -> bytes:
        image = self._pyboy.screen.image
        if image is None:
            return ONE_PIXEL_PNG
        output = BytesIO()
        image.save(output, "PNG")
        payload = output.getvalue()
        if len(payload) == 0:
            return ONE_PIXEL_PNG
        return payload

    def screenshot_size(self) -> tuple[int, int]:
        image = self._pyboy.screen.image
        if image is None:
            return (1, 1)
        return (image.width, image.height)

    def observe(self, last_action: ActionRequest | None) -> Observation:
        width, height = self.screenshot_size()
        state = self.state()
        return Observation(
            frame=self._frame,
            state=state,
            screenshot=Screenshot(
                pngBase64=b64encode(self.screenshot_png()).decode("ascii"),
                width=width,
                height=height,
            ),
            lastAction=last_action,
            parserWarnings=state.parser_warnings,
        )

    def perform(self, action: ActionRequest) -> Observation:
        for step in action.sequence:
            match step:  # noqa: MATCH_OK - ActionStep union is exhaustively covered.
                case WaitStep(frames=frames):
                    self._tick(frames)
                case ButtonStep(button=button, press_frames=press_frames, wait_frames=wait_frames):
                    self._pyboy.button(BUTTON_NAME_MAP[button], delay=press_frames)
                    self._tick(press_frames + wait_frames)
                case WalkStep(
                    direction=direction,
                    press_frames=press_frames,
                    wait_frames=wait_frames,
                ):
                    self._pyboy.button(BUTTON_NAME_MAP[direction], delay=press_frames)
                    self._tick(press_frames + wait_frames)
                case HoldStep(button=button, frames=frames):
                    self._pyboy.button(BUTTON_NAME_MAP[button], delay=frames)
                    self._tick(frames)
                case TextSkipUntilDialogEndStep(
                    button=button,
                    press_frames=press_frames,
                    wait_frames=wait_frames,
                    max_presses=max_presses,
                ):
                    self._text_skip_until_dialog_end(
                        button=button,
                        press_frames=press_frames,
                        wait_frames=wait_frames,
                        max_presses=max_presses,
                    )
        return self.observe(last_action=action)

    def save_state_bytes(self) -> bytes:
        output = BytesIO()
        self._pyboy.save_state(output)
        return output.getvalue()

    def load_state_bytes(self, payload: bytes) -> None:
        self._pyboy.load_state(BytesIO(payload))
        self._save_state_loaded = True

    def reset_rom(self) -> None:
        self._pyboy.stop(save=False)
        self._frame = 0
        self._save_state_loaded = False

    def reset_to_initial_save_state(self) -> None:
        if self._initial_save_state_path is not None:
            with self._initial_save_state_path.open("rb") as save_state:
                self._pyboy.load_state(save_state)
        self._frame = 0
        self._save_state_loaded = self._initial_save_state_path is not None

    def _text_skip_until_dialog_end(
        self,
        *,
        button: str,
        press_frames: int,
        wait_frames: int,
        max_presses: int,
    ) -> None:
        for _ in range(max_presses):
            if not self.state().dialog.active:
                return
            self._pyboy.button(BUTTON_NAME_MAP[button], delay=press_frames)
            self._tick(press_frames + wait_frames)

    def _tick(self, frames: int) -> None:
        for _ in range(frames):
            _ = self._pyboy.tick()
        self._frame += frames
