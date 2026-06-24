import base64
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from pokemon_harness.app import create_app
from pokemon_harness.fake_emulator import FakeEmulator
from pokemon_harness.save_store import SaveStore
from pokemon_harness.schemas import (
    ActionResponse,
    HealthResponse,
    Position,
    ScreenshotBase64Response,
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


def test_screenshot_base64_reports_abi_version(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    response = client.get("/screenshot", params={"format": "base64"})

    body = ScreenshotBase64Response.model_validate_json(response.content)
    assert response.status_code == 200
    assert body.abi_version == "v1"
    assert response.json()["abiVersion"] == "v1"
    assert body.png_base64


def test_duplicate_save_returns_conflict(tmp_path: Path) -> None:
    emulator = FakeEmulator()
    client = TestClient(create_app(emulator=emulator, save_store=SaveStore(root=tmp_path)))

    first = client.post("/save", json={"name": "qa-smoke", "overwrite": False})
    second = client.post("/save", json={"name": "qa-smoke", "overwrite": False})

    assert first.status_code == 200
    assert second.status_code == 409
