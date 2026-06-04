import pytest
from pydantic import ValidationError

from pokemon_harness.schemas import (
    ActionRequest,
    ButtonStep,
    HoldStep,
    TextSkipUntilDialogEndStep,
    WaitStep,
    WalkStep,
)


def test_action_request_defaults_button_timing_when_frames_omitted() -> None:
    request = ActionRequest.model_validate(
        {
            "controllerId": "manual-cli",
            "sequence": [{"type": "button", "button": "up"}],
        }
    )
    step = request.sequence[0]

    assert isinstance(step, ButtonStep)
    assert step.press_frames == 8
    assert step.wait_frames == 632


def test_action_request_uses_action_button_timing_when_button_is_a() -> None:
    request = ActionRequest.model_validate(
        {
            "controllerId": "manual-cli",
            "sequence": [{"type": "button", "button": "a"}],
        }
    )
    step = request.sequence[0]

    assert isinstance(step, ButtonStep)
    assert step.press_frames == 6
    assert step.wait_frames == 634


def test_action_request_rejects_overlong_sequences() -> None:
    sequence = [{"type": "wait", "frames": 1} for _ in range(33)]

    with pytest.raises(ValidationError, match="at most 32"):
        _ = ActionRequest.model_validate({"controllerId": "manual-cli", "sequence": sequence})


def test_action_request_rejects_negative_wait_frames() -> None:
    with pytest.raises(ValidationError, match="greater than or equal to 1"):
        _ = ActionRequest.model_validate(
            {
                "controllerId": "manual-cli",
                "sequence": [{"type": "wait", "frames": -1}],
            }
        )


def test_button_step_defaults_are_unchanged_when_text_skip_exists() -> None:
    button_request = ActionRequest.model_validate(
        {
            "controllerId": "manual-cli",
            "sequence": [{"type": "button", "button": "a"}],
        }
    )
    text_skip_request = ActionRequest.model_validate(
        {
            "controllerId": "manual-cli",
            "sequence": [{"type": "text_skip_until_dialog_end"}],
        }
    )

    button_step = button_request.sequence[0]
    text_skip_step = text_skip_request.sequence[0]

    assert isinstance(button_step, ButtonStep)
    assert button_step.press_frames == 6
    assert button_step.wait_frames == 634
    assert isinstance(text_skip_step, TextSkipUntilDialogEndStep)
    assert text_skip_step.button == "a"
    assert text_skip_step.press_frames == 6
    assert text_skip_step.wait_frames == 60
    assert text_skip_step.max_presses == 10


def test_walk_and_hold_steps_are_bounded_fast_actions() -> None:
    request = ActionRequest.model_validate(
        {
            "controllerId": "agent-cli",
            "sequence": [
                {"type": "walk", "direction": "up"},
                {"type": "hold", "button": "a", "frames": 30},
            ],
        }
    )

    walk_step = request.sequence[0]
    hold_step = request.sequence[1]

    assert walk_step.type == "walk"
    assert walk_step.press_frames == 8
    assert walk_step.wait_frames == 12
    assert hold_step.type == "hold"
    assert hold_step.frames == 30


def test_hold_step_rejects_unbounded_frames() -> None:
    with pytest.raises(ValidationError, match="less than or equal to 600"):
        _ = ActionRequest.model_validate(
            {
                "controllerId": "agent-cli",
                "sequence": [{"type": "hold", "button": "a", "frames": 601}],
            }
        )


def test_nous_action_tokens_are_normalized_to_typed_sequence() -> None:
    request = ActionRequest.model_validate(
        {
            "actions": [
                "walk_up",
                "press_a",
                "wait_60",
                "hold_a_30",
                "a_until_dialog_end",
            ],
        }
    )

    walk_step = request.sequence[0]
    press_step = request.sequence[1]
    wait_step = request.sequence[2]
    hold_step = request.sequence[3]
    text_skip_step = request.sequence[4]

    assert request.controller_id == "agent-cli"
    assert isinstance(walk_step, WalkStep)
    assert walk_step.direction == "up"
    assert isinstance(press_step, ButtonStep)
    assert press_step.button == "a"
    assert isinstance(wait_step, WaitStep)
    assert wait_step.frames == 60
    assert isinstance(hold_step, HoldStep)
    assert hold_step.button == "a"
    assert hold_step.frames == 30
    assert isinstance(text_skip_step, TextSkipUntilDialogEndStep)


def test_nous_action_tokens_reject_unknown_actions() -> None:
    with pytest.raises(ValidationError, match="unsupported action token"):
        _ = ActionRequest.model_validate(
            {
                "actions": ["teleport_home"],
            }
        )
