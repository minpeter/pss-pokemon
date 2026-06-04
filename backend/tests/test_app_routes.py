import base64
from io import BytesIO
from pathlib import Path
from typing import final, override

from fastapi.testclient import TestClient
from PIL import Image

from pokemon_harness.app import create_app
from pokemon_harness.fake_emulator import FakeEmulator
from pokemon_harness.save_store import SaveStore
from pokemon_harness.schemas import ActionResponse, DialogState, GameState, HealthResponse, Position


class DialogClearingFakeEmulator(FakeEmulator):
    @override
    def state(self) -> GameState:
        state = super().state()
        return state.model_copy(
            update={"dialog": DialogState(active=self.frame < 132, text=None)},
        )


def test_health_reports_loaded_fake_emulator(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    response = client.get("/health")
    body = HealthResponse.model_validate_json(response.content)

    assert response.status_code == 200
    assert body.rom_loaded is True


def test_action_advances_frames_and_returns_observation(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    response = client.post(
        "/action",
        json={
            "controllerId": "manual-cli",
            "sequence": [{"type": "button", "button": "up"}, {"type": "wait", "frames": 60}],
        },
    )

    body = ActionResponse.model_validate_json(response.content)
    assert response.status_code == 200
    assert body.accepted is True
    assert body.frame_after > body.frame_before
    assert body.observation.state.collision.player_tile == Position(x=5, y=6)


def test_fake_backend_returns_visible_screenshot(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    response = client.post(
        "/action",
        json={"controllerId": "manual-cli", "sequence": [{"type": "wait", "frames": 1}]},
    )

    body = ActionResponse.model_validate_json(response.content)
    screenshot = body.observation.screenshot
    image = Image.open(BytesIO(base64.b64decode(screenshot.png_base64)))

    assert response.status_code == 200
    assert screenshot.width == 160
    assert screenshot.height == 144
    assert image.size == (160, 144)
    assert len(image.getcolors(maxcolors=256) or ()) > 1


def test_duplicate_save_returns_conflict(tmp_path: Path) -> None:
    emulator = FakeEmulator()
    client = TestClient(create_app(emulator=emulator, save_store=SaveStore(root=tmp_path)))

    first = client.post("/save", json={"name": "qa-smoke", "overwrite": False})
    second = client.post("/save", json={"name": "qa-smoke", "overwrite": False})

    assert first.status_code == 200
    assert second.status_code == 409


def test_second_controller_is_rejected(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))
    first = client.post(
        "/action",
        json={"controllerId": "manual-cli", "sequence": [{"type": "wait", "frames": 1}]},
    )

    second = client.post(
        "/action",
        json={"controllerId": "other-cli", "sequence": [{"type": "wait", "frames": 1}]},
    )

    assert first.status_code == 200
    assert second.status_code == 409


def test_stale_controller_lease_can_be_reclaimed(tmp_path: Path) -> None:
    clock = FakeClock()
    client = TestClient(
        create_app(
            emulator=FakeEmulator(),
            save_store=SaveStore(root=tmp_path),
            clock=clock,
            controller_lease_seconds=5.0,
        )
    )
    first = client.post(
        "/action",
        json={"controllerId": "agent-cli", "sequence": [{"type": "wait", "frames": 1}]},
    )
    blocked = client.post(
        "/action",
        json={"controllerId": "manual-cli", "sequence": [{"type": "wait", "frames": 1}]},
    )

    clock.advance(6.0)
    health = client.get("/health")
    reclaimed = client.post(
        "/action",
        json={"controllerId": "manual-cli", "sequence": [{"type": "wait", "frames": 1}]},
    )

    assert first.status_code == 200
    assert blocked.status_code == 409
    assert health.json()["activeControllerId"] is None
    assert reclaimed.status_code == 200


def test_dialog_text_skip_stops_when_dialog_clears(tmp_path: Path) -> None:
    client = TestClient(
        create_app(emulator=DialogClearingFakeEmulator(), save_store=SaveStore(root=tmp_path))
    )

    response = client.post(
        "/action",
        json={
            "controllerId": "manual-cli",
            "sequence": [
                {
                    "type": "text_skip_until_dialog_end",
                    "button": "a",
                    "pressFrames": 6,
                    "waitFrames": 60,
                    "maxPresses": 10,
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["frameAfter"] == 132
    assert response.json()["observation"]["lastAction"]["sequence"] == [
        {
            "type": "text_skip_until_dialog_end",
            "button": "a",
            "pressFrames": 6,
            "waitFrames": 60,
            "maxPresses": 10,
        }
    ]


def test_action_accepts_nous_style_action_tokens(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    response = client.post(
        "/action",
        json={"actions": ["walk_up", "press_a", "wait_60", "hold_a_30"]},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["frameAfter"] > body["frameBefore"]
    assert body["observation"]["lastAction"]["controllerId"] == "agent-cli"
    assert body["observation"]["lastAction"]["sequence"] == [
        {"type": "walk", "direction": "up", "pressFrames": 8, "waitFrames": 12},
        {"type": "button", "button": "a", "pressFrames": 6, "waitFrames": 634},
        {"type": "wait", "frames": 60},
        {"type": "hold", "button": "a", "frames": 30},
    ]


@final
class FakeClock:
    _now: float

    def __init__(self) -> None:
        self._now = 0.0

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds
