import json
from io import BytesIO
from pathlib import Path
from typing import Final

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

from pokemon_harness.app import create_app
from pokemon_harness.fake_emulator import FakeEmulator
from pokemon_harness.save_store import SaveStore
from pokemon_harness.schemas import (
    ActionRequest,
    ActionResponse,
    GameState,
    HealthResponse,
    Observation,
    ScreenshotBase64Response,
)

ABI_FIXTURE_DIR: Final = Path(__file__).resolve().parents[2] / "test-fixtures" / "abi-v1"


def test_abi_route_fake_backend_route_compatibility(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    health_response = client.get("/health")
    health = HealthResponse.model_validate_json(health_response.content)
    assert health_response.status_code == 200
    assert health.status == "ok"
    assert health.rom_loaded is True

    state_response = client.get("/state")
    state = GameState.model_validate_json(state_response.content)
    assert state_response.status_code == 200
    assert state.emulator.rom_loaded is True
    assert state.collision.player_cell == "E5"

    screenshot_response = client.get("/screenshot")
    screenshot_image = Image.open(BytesIO(screenshot_response.content))
    assert screenshot_response.status_code == 200
    assert screenshot_response.headers["content-type"] == "image/png"
    assert screenshot_image.size == (160, 144)

    base64_response = client.get("/screenshot", params={"format": "base64"})
    screenshot = ScreenshotBase64Response.model_validate_json(base64_response.content)
    assert base64_response.status_code == 200
    assert base64_response.json()["abiVersion"] == "v1"
    assert screenshot.abi_version == "v1"
    assert screenshot.png_base64

    grid_response = client.get("/screenshot/grid", params={"scale": 4})
    grid_image = Image.open(BytesIO(grid_response.content))
    assert grid_response.status_code == 200
    assert grid_response.headers["content-type"] == "image/png"
    assert grid_image.size == (640, 576)

    ascii_response = client.get("/map/ascii")
    ascii_body = ascii_response.json()
    assert ascii_response.status_code == 200
    assert ascii_body["playerCell"] == "E5"
    assert ascii_body["passableDirections"] == ["up", "left", "right"]
    assert "@ you (E5)" in ascii_body["ascii"]

    action_response = client.post(
        "/action",
        json={"controllerId": "manual-cli", "sequence": [{"type": "wait", "frames": 1}]},
    )
    action_body = action_response.json()
    action = ActionResponse.model_validate_json(action_response.content)
    assert action_response.status_code == 200
    assert "frameAfter" in action_body
    assert action.frame_after > action.frame_before
    assert action_body["observation"]["abiVersion"] == "v1"
    assert action.observation.abi_version == "v1"
    assert action.observation.screenshot.abi_version == "v1"


def test_shared_abi_fixture_models_parse_observation_and_action() -> None:
    observation_data = json.loads((ABI_FIXTURE_DIR / "observation.json").read_text())
    action_request_data = json.loads((ABI_FIXTURE_DIR / "action-request.json").read_text())
    action_response_data = json.loads((ABI_FIXTURE_DIR / "action-response.json").read_text())

    observation = Observation.model_validate(observation_data)
    action_request = ActionRequest.model_validate(action_request_data)
    action_response = ActionResponse.model_validate(action_response_data)

    assert observation.abi_version == "v1"
    assert observation.screenshot.abi_version == "v1"
    assert observation.screenshot.png_base64 == "AA=="
    assert action_request.controller_id == "agent-cli"
    assert action_response.accepted is True
    assert action_response.observation.abi_version == "v1"
    assert action_response.observation.last_action == action_request
    with pytest.raises(ValidationError):
        _ = Observation.model_validate({"type": "observation"})


def test_shared_abi_fixture_metadata_examples_keep_required_keys() -> None:
    wrapped_expected_kinds = {
        "event.json": "event",
        "objective-result.json": "objective_result",
        "doneclaim.json": "doneclaim",
    }

    for fixture_name, expected_kind in wrapped_expected_kinds.items():
        fixture = json.loads((ABI_FIXTURE_DIR / fixture_name).read_text())

        metadata = fixture["metadata"]
        example = fixture["example"]
        assert metadata["abiVersion"] == "v1"
        assert metadata["kind"] == expected_kind
        assert metadata["exampleId"]
        assert metadata["recordedAt"]
        assert example["type"] == expected_kind

    replay = json.loads((ABI_FIXTURE_DIR / "replay.json").read_text())
    assert replay["abiVersion"] == "pss-pokemon.trace.v1"
    assert replay["schemaVersion"] == 1
    assert replay["type"] == "replay"
    assert replay["timestamp"]
    assert replay["runId"]
    assert replay["replayId"]

    replay_metadata = replay["metadata"]
    assert replay_metadata["type"] == "harness_run_metadata"
    assert replay_metadata["backendKind"]
    assert replay_metadata["controllerMode"]
    assert replay_metadata["objectiveId"]

    replay_events = replay["events"]
    assert replay_events
    assert {"observation", "action"} <= {event["type"] for event in replay_events}
    for event in replay_events:
        assert isinstance(event["atFrame"], int)
        assert event["atFrame"] >= 0
