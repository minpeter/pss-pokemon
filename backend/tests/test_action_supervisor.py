import pytest

from pokemon_harness.action_supervisor import UnsafeActionSequenceError, supervise_action_request
from pokemon_harness.schemas import (
    ActionRequest,
    TextSkipUntilDialogEndStep,
    WaitStep,
    WalkStep,
)


def test_supervisor_normalizes_walk_to_one_tile_timing() -> None:
    action = ActionRequest.model_validate(
        {
            "controllerId": "manual-cli",
            "sequence": [{"type": "walk", "direction": "up", "pressFrames": 60, "waitFrames": 600}],
        }
    )

    supervised = supervise_action_request(action)
    step = supervised.sequence[0]

    assert isinstance(step, WalkStep)
    assert step.press_frames == 8
    assert step.wait_frames == 12


def test_supervisor_normalizes_dialog_settle_timing() -> None:
    action = ActionRequest.model_validate(
        {
            "controllerId": "manual-cli",
            "sequence": [
                {
                    "type": "text_skip_until_dialog_end",
                    "button": "a",
                    "pressFrames": 1,
                    "waitFrames": 0,
                    "maxPresses": 32,
                }
            ],
        }
    )

    supervised = supervise_action_request(action)
    step = supervised.sequence[0]

    assert isinstance(step, TextSkipUntilDialogEndStep)
    assert step.press_frames == 1
    assert step.wait_frames == 60
    assert step.max_presses == 10


def test_supervisor_defaults_corrupted_dialog_timing_values() -> None:
    action = ActionRequest.model_validate(
        {
            "controllerId": "manual-cli",
            "sequence": [{"type": "text_skip_until_dialog_end", "button": "a"}],
        }
    )
    step = action.sequence[0]
    assert isinstance(step, TextSkipUntilDialogEndStep)
    corrupted_step = step.model_copy(update={"max_presses": None, "wait_frames": None})
    corrupted_action = action.model_copy(update={"sequence": (corrupted_step,)})

    supervised = supervise_action_request(corrupted_action)
    normalized_step = supervised.sequence[0]

    assert isinstance(normalized_step, TextSkipUntilDialogEndStep)
    assert normalized_step.wait_frames == 60
    assert normalized_step.max_presses == 10


def test_supervisor_rejects_unsafe_multi_hold_sequences() -> None:
    action = ActionRequest.model_validate(
        {
            "controllerId": "agent-cli",
            "sequence": [
                {"type": "hold", "button": "a", "frames": 30},
                {"type": "hold", "button": "b", "frames": 30},
            ],
        }
    )

    with pytest.raises(UnsafeActionSequenceError, match="multiple hold"):
        _ = supervise_action_request(action)


def test_supervisor_rejects_excessive_wait_frames() -> None:
    action = ActionRequest.model_validate(
        {
            "controllerId": "agent-cli",
            "sequence": [{"type": "wait", "frames": 601}],
        }
    )

    with pytest.raises(UnsafeActionSequenceError, match="wait frames"):
        _ = supervise_action_request(action)


def test_supervisor_keeps_bounded_wait_frames() -> None:
    action = ActionRequest.model_validate(
        {
            "controllerId": "agent-cli",
            "sequence": [{"type": "wait", "frames": 600}],
        }
    )

    step = supervise_action_request(action).sequence[0]

    assert isinstance(step, WaitStep)
    assert step.frames == 600
