from typing import Final

from pokemon_harness.schemas import (
    ActionRequest,
    ActionStep,
    ButtonStep,
    HoldStep,
    TextSkipUntilDialogEndStep,
    WaitStep,
    WalkStep,
)

MAX_SUPERVISED_WAIT_FRAMES: Final = 600
MAX_SUPERVISED_SEQUENCE_FRAMES: Final = 3600
ONE_TILE_PRESS_FRAMES: Final = 8
ONE_TILE_WAIT_FRAMES: Final = 12
DIALOG_SETTLE_WAIT_FRAMES: Final = 60
TEXT_SKIP_MAX_PRESSES: Final = 10
MULTIPLE_HOLD_ERROR: Final = "unsafe action sequence: multiple hold steps are rejected"


def supervise_action_request(action: ActionRequest) -> ActionRequest:
    reject_unsafe_multi_hold(action)
    normalized_sequence = tuple(normalize_step(step) for step in action.sequence)
    normalized = action.model_copy(update={"sequence": normalized_sequence})
    reject_excessive_frame_budget(normalized)
    return normalized


class UnsafeActionSequenceError(ValueError):
    pass


def reject_unsafe_multi_hold(action: ActionRequest) -> None:
    hold_steps = sum(isinstance(step, HoldStep) for step in action.sequence)
    if hold_steps > 1:
        raise UnsafeActionSequenceError(MULTIPLE_HOLD_ERROR)


def reject_excessive_frame_budget(action: ActionRequest) -> None:
    longest_wait = max(
        (step.frames for step in action.sequence if isinstance(step, WaitStep)),
        default=0,
    )
    if longest_wait > MAX_SUPERVISED_WAIT_FRAMES:
        message = f"unsafe action sequence: wait frames must be <= {MAX_SUPERVISED_WAIT_FRAMES}"
        raise UnsafeActionSequenceError(message)

    total_frames = sum(frame_cost(step) for step in action.sequence)
    if total_frames > MAX_SUPERVISED_SEQUENCE_FRAMES:
        message = (
            f"unsafe action sequence: total frames must be <= {MAX_SUPERVISED_SEQUENCE_FRAMES}"
        )
        raise UnsafeActionSequenceError(message)


def normalize_step(step: ActionStep) -> ActionStep:
    match step:
        case WalkStep():
            return step.model_copy(
                update={"press_frames": ONE_TILE_PRESS_FRAMES, "wait_frames": ONE_TILE_WAIT_FRAMES},
            )
        case TextSkipUntilDialogEndStep():
            max_presses = int_or_default(step.max_presses, TEXT_SKIP_MAX_PRESSES)
            wait_frames = int_or_default(step.wait_frames, DIALOG_SETTLE_WAIT_FRAMES)
            return step.model_copy(
                update={
                    "max_presses": min(max_presses, TEXT_SKIP_MAX_PRESSES),
                    "wait_frames": max(wait_frames, DIALOG_SETTLE_WAIT_FRAMES),
                },
            )
        case ButtonStep() | WaitStep() | HoldStep():
            return step


def frame_cost(step: ActionStep) -> int:
    match step:
        case ButtonStep(press_frames=press_frames, wait_frames=wait_frames) | WalkStep(
            press_frames=press_frames,
            wait_frames=wait_frames,
        ):
            return int_or_default(press_frames, 0) + int_or_default(wait_frames, 0)
        case TextSkipUntilDialogEndStep(
            press_frames=press_frames,
            wait_frames=wait_frames,
            max_presses=max_presses,
        ):
            step_frames = int_or_default(press_frames, 0) + int_or_default(wait_frames, 0)
            return step_frames * int_or_default(max_presses, 0)
        case WaitStep(frames=frames) | HoldStep(frames=frames):
            return frames


def int_or_default(value: int | None, fallback: int) -> int:
    if value is None:
        return fallback
    return value
