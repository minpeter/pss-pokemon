from enum import StrEnum
from typing import Annotated, ClassVar, Final, Literal, Self, TypeGuard

from pydantic import Field, model_validator

from pokemon_harness.model_base import HarnessModel


class Button(StrEnum):
    UP = "up"
    DOWN = "down"
    LEFT = "left"
    RIGHT = "right"
    A = "a"
    B = "b"
    START = "start"
    SELECT = "select"


MOVEMENT_BUTTON_TIMING: Final = (8, 632)
ACTION_BUTTON_TIMING: Final = (6, 634)
WALK_BUTTON_TIMING: Final = (8, 12)
TEXT_SKIP_BUTTON_TIMING: Final = (6, 60)
TEXT_SKIP_MAX_PRESSES: Final = 10
DEFAULT_CONTROLLER_ID: Final = "agent-cli"
NOUS_TEXT_SKIP_ACTION: Final = "a_until_dialog_end"
HOLD_ACTION_PARTS: Final = 2
type RawActionStep = dict[str, str | int]
type JsonValue = (
    RawActionStep
    | dict[str, JsonValue]
    | list[JsonValue]
    | tuple[JsonValue, ...]
    | str
    | int
    | float
    | bool
    | None
)
BUTTON_TIMING_BY_BUTTON: Final[dict[Button, tuple[int, int]]] = {
    Button.UP: MOVEMENT_BUTTON_TIMING,
    Button.DOWN: MOVEMENT_BUTTON_TIMING,
    Button.LEFT: MOVEMENT_BUTTON_TIMING,
    Button.RIGHT: MOVEMENT_BUTTON_TIMING,
    Button.A: ACTION_BUTTON_TIMING,
    Button.B: ACTION_BUTTON_TIMING,
    Button.START: ACTION_BUTTON_TIMING,
    Button.SELECT: ACTION_BUTTON_TIMING,
}


class ButtonStep(HarnessModel):
    type: Literal["button"]
    button: Button
    press_frames: int = Field(default=0, alias="pressFrames", ge=0)
    wait_frames: int = Field(default=0, alias="waitFrames", ge=0)

    @model_validator(mode="after")
    def with_default_timing(self) -> Self:
        if self.press_frames > 0 and self.wait_frames > 0:
            return self
        press_frames, wait_frames = default_button_timing(self.button)
        resolved_press_frames = self.press_frames if self.press_frames > 0 else press_frames
        resolved_wait_frames = self.wait_frames if self.wait_frames > 0 else wait_frames
        return self.model_copy(
            update={
                "press_frames": resolved_press_frames,
                "wait_frames": resolved_wait_frames,
            }
        )


class WaitStep(HarnessModel):
    type: Literal["wait"]
    frames: int = Field(ge=1)


class WalkStep(HarnessModel):
    type: Literal["walk"]
    direction: Literal[Button.UP, Button.DOWN, Button.LEFT, Button.RIGHT]
    press_frames: int = Field(default=WALK_BUTTON_TIMING[0], alias="pressFrames", ge=1, le=60)
    wait_frames: int = Field(default=WALK_BUTTON_TIMING[1], alias="waitFrames", ge=0, le=600)


class HoldStep(HarnessModel):
    type: Literal["hold"]
    button: Button
    frames: int = Field(ge=1, le=600)


class TextSkipUntilDialogEndStep(HarnessModel):
    type: Literal["text_skip_until_dialog_end"]
    button: Literal["a"] = "a"
    press_frames: int = Field(
        default=TEXT_SKIP_BUTTON_TIMING[0],
        alias="pressFrames",
        ge=1,
    )
    wait_frames: int = Field(
        default=TEXT_SKIP_BUTTON_TIMING[1],
        alias="waitFrames",
        ge=0,
    )
    max_presses: int = Field(default=TEXT_SKIP_MAX_PRESSES, alias="maxPresses", ge=1, le=32)


type ActionStep = Annotated[
    ButtonStep | WaitStep | WalkStep | HoldStep | TextSkipUntilDialogEndStep,
    Field(discriminator="type"),
]


class ActionRequest(HarnessModel):
    controller_id: str = Field(default=DEFAULT_CONTROLLER_ID, alias="controllerId", min_length=1)
    sequence: tuple[ActionStep, ...] = Field(min_length=1, max_length=32)

    @model_validator(mode="before")
    @classmethod
    def normalize_nous_action_tokens(cls, data: JsonValue) -> JsonValue:
        if not isinstance(data, dict) or "sequence" in data or "actions" not in data:
            return data

        actions = data["actions"]
        if not is_action_name_sequence(actions):
            raise InvalidActionsFieldError

        normalized: list[JsonValue] = [nous_action_token_to_step(action) for action in actions]
        normalized_data: dict[str, JsonValue] = dict(data)
        normalized_data["sequence"] = normalized
        return normalized_data


def default_button_timing(button: Button) -> tuple[int, int]:
    return BUTTON_TIMING_BY_BUTTON[button]


def is_action_name_sequence(value: JsonValue) -> TypeGuard[list[str] | tuple[str, ...]]:
    return isinstance(value, list | tuple) and all(isinstance(action, str) for action in value)


def nous_action_token_to_step(action_name: str) -> RawActionStep:
    if action_name == NOUS_TEXT_SKIP_ACTION:
        return {"button": "a", "type": "text_skip_until_dialog_end"}

    if action_name.startswith("press_"):
        return {
            "button": parse_button_action(action_name.removeprefix("press_"), action_name),
            "type": "button",
        }

    if action_name.startswith("walk_"):
        return {
            "direction": parse_direction_action(action_name.removeprefix("walk_"), action_name),
            "type": "walk",
        }

    if action_name.startswith("wait_"):
        return {
            "frames": parse_frame_action(action_name.removeprefix("wait_"), action_name),
            "type": "wait",
        }

    if action_name.startswith("hold_"):
        parts = action_name.removeprefix("hold_").rsplit("_", maxsplit=1)
        if len(parts) != HOLD_ACTION_PARTS:
            raise UnsupportedNousActionError(action_name)
        return {
            "button": parse_button_action(parts[0], action_name),
            "frames": parse_frame_action(parts[1], action_name),
            "type": "hold",
        }

    raise UnsupportedNousActionError(action_name)


def parse_button_action(value: str, action_name: str) -> Button:
    try:
        return Button(value)
    except ValueError as error:
        raise UnsupportedNousActionError(action_name) from error


def parse_direction_action(value: str, action_name: str) -> Button:
    direction = parse_button_action(value, action_name)
    if direction in (Button.UP, Button.DOWN, Button.LEFT, Button.RIGHT):
        return direction
    raise UnsupportedNousActionError(action_name)


def parse_frame_action(value: str, action_name: str) -> int:
    try:
        return int(value)
    except ValueError as error:
        raise UnsupportedNousActionError(action_name) from error


class InvalidActionsFieldError(TypeError):
    MESSAGE: ClassVar[str] = "actions must be a list of action names"

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class UnsupportedNousActionError(ValueError):
    def __init__(self, action_name: JsonValue) -> None:
        super().__init__(f"unsupported action token: {action_name}")
