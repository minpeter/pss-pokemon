import base64
from io import BytesIO
from typing import Final

from PIL import Image, ImageDraw

from pokemon_harness.schemas import (
    ActionRequest,
    BadgesState,
    BagItem,
    BattleState,
    ButtonStep,
    CollisionState,
    DialogState,
    EmulatorState,
    FlagsState,
    GameState,
    HoldStep,
    MapState,
    Observation,
    PartyMember,
    PlayerState,
    Position,
    Screenshot,
    TextSkipUntilDialogEndStep,
    WaitStep,
    WalkStep,
)

ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)
SCREENSHOT_WIDTH: Final = 160
SCREENSHOT_HEIGHT: Final = 144
TILE_SIZE: Final = 16
FAKE_GRID: Final = (
    (False, False, False, False, True, True, True, True, True, True),
    (False, False, False, False, False, True, False, False, False, True),
    (True, True, True, True, True, True, True, True, True, True),
    (True, True, True, True, True, True, True, True, True, True),
    (True, True, True, True, True, True, True, True, True, True),
    (False, False, False, False, False, False, False, False, False, False),
    (True, True, True, False, True, True, True, True, True, False),
    (True, True, True, True, True, True, True, True, True, True),
    (False, False, False, False, True, True, True, True, True, True),
)
FAKE_ASCII_MAP: Final = (
    "  A B C D E F G H I J\n"
    " 1 # # # # . . . . . .\n"
    " 2 # # # # # . # # # .\n"
    " 3 . . . . . . . . . .\n"
    " 4 . . . . . . . . . .\n"
    " 5 . . . . @ . . . . .\n"
    " 6 # # # # # # # # # #\n"
    " 7 . . . # . . . . . #\n"
    " 8 . . . . . . . . . .\n"
    " 9 # # # # . . . . . .\n"
    "\n"
    "@ you (E5) . walkable # blocked\n"
    "up=row-1 down=row+1 left=col-1 right=col+1"
)


def build_fake_screenshot_png() -> bytes:
    image = Image.new("RGB", (SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT), "#9bbc0f")
    draw = ImageDraw.Draw(image)
    grass = "#8bac0f"
    path = "#c4d35c"
    border = "#306230"
    player = "#0f380f"

    draw.rectangle((0, 0, SCREENSHOT_WIDTH - 1, SCREENSHOT_HEIGHT - 1), outline=border, width=3)
    draw.rectangle((0, 56, SCREENSHOT_WIDTH - 1, 104), fill=path)
    draw.rectangle((64, 0, 96, SCREENSHOT_HEIGHT - 1), fill=path)

    for x in range(0, SCREENSHOT_WIDTH, TILE_SIZE):
        for y in range(0, SCREENSHOT_HEIGHT, TILE_SIZE):
            if (x // TILE_SIZE + y // TILE_SIZE) % 2 == 0:
                draw.rectangle((x, y, x + 3, y + 3), fill=grass)

    draw.rectangle((72, 80, 88, 96), fill=player)
    draw.rectangle((76, 72, 84, 80), fill=player)
    draw.text((8, 8), "FAKE PALLET", fill=player)

    output = BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


FAKE_SCREENSHOT_PNG: Final = build_fake_screenshot_png()


class FakeEmulator:
    def __init__(self) -> None:
        self._frame: int = 0
        self._save_state_loaded: bool = True

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
        return GameState(
            emulator=EmulatorState(frame=self._frame, romLoaded=True, saveStateLoaded=True),
            player=PlayerState(name="RED", tile=Position(x=5, y=6), facing="up"),
            map=MapState(id=0, name="Pallet Town"),
            party=(
                PartyMember(species="Squirtle", level=5, hp=19, maxHp=19, status=None),
            ),
            bag=(BagItem(name="Potion", quantity=1),),
            badges=BadgesState(owned=()),
            battle=BattleState(active=False, kind=None, opponent=None),
            dialog=DialogState(active=False, text=None),
            flags=FlagsState(values={}),
            collision=CollisionState(
                mapId=0,
                mapName="Pallet Town",
                width=10,
                height=9,
                grid=FAKE_GRID,
                playerTile=Position(x=5, y=6),
                passableDirections=("up", "left", "right"),
                ascii=FAKE_ASCII_MAP,
                playerCell="E5",
            ),
            parserWarnings=(),
        )

    def screenshot_png(self) -> bytes:
        return FAKE_SCREENSHOT_PNG

    def screenshot_size(self) -> tuple[int, int]:
        return (SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT)

    def observe(self, last_action: ActionRequest | None) -> Observation:
        width, height = self.screenshot_size()
        return Observation(
            frame=self._frame,
            state=self.state(),
            screenshot=Screenshot(
                pngBase64=base64.b64encode(self.screenshot_png()).decode("ascii"),
                width=width,
                height=height,
            ),
            lastAction=last_action,
            parserWarnings=(),
        )

    def perform(self, action: ActionRequest) -> Observation:
        for step in action.sequence:
            match step:  # noqa: MATCH_OK - ActionStep union is exhaustively covered.
                case WaitStep(frames=frames):
                    self._frame += frames
                case ButtonStep(press_frames=press_frames, wait_frames=wait_frames) | WalkStep(
                    press_frames=press_frames,
                    wait_frames=wait_frames,
                ):
                    self._frame += press_frames + wait_frames
                case HoldStep(frames=frames):
                    self._frame += frames
                case TextSkipUntilDialogEndStep(
                    press_frames=press_frames,
                    wait_frames=wait_frames,
                    max_presses=max_presses,
                ):
                    self._text_skip_until_dialog_end(
                        press_frames=press_frames,
                        wait_frames=wait_frames,
                        max_presses=max_presses,
                    )
        return self.observe(last_action=action)

    def _text_skip_until_dialog_end(
        self,
        *,
        press_frames: int,
        wait_frames: int,
        max_presses: int,
    ) -> None:
        for _ in range(max_presses):
            if not self.state().dialog.active:
                return
            self._frame += press_frames + wait_frames

    def save_state_bytes(self) -> bytes:
        return f"fake-frame:{self._frame}".encode()

    def load_state_bytes(self, payload: bytes) -> None:
        prefix = b"fake-frame:"
        if payload.startswith(prefix):
            self._frame = int(payload.removeprefix(prefix).decode())
        self._save_state_loaded = True

    def reset_rom(self) -> None:
        self._frame = 0
        self._save_state_loaded = False

    def reset_to_initial_save_state(self) -> None:
        self._frame = 0
        self._save_state_loaded = True
