from pathlib import Path

from fastapi.testclient import TestClient

from pokemon_harness.app import create_app
from pokemon_harness.fake_emulator import FakeEmulator
from pokemon_harness.save_store import SaveStore


def test_event_history_objectives_control_and_game_summary(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    event_response = client.post("/event", json={"type": "reasoning", "text": "At E5"})
    events_response = client.get("/events")
    default_objectives = client.get("/objectives")
    objectives_response = client.post(
        "/objectives",
        json={
            "objectives": [
                {"tier": "primary", "text": "Reach Pewter City", "done": False},
                {"tier": "secondary", "text": "Keep Charmander healthy", "done": False},
            ]
        },
    )
    control_default = client.get("/control")
    control_response = client.post("/control", json={"state": "running"})
    game_response = client.get("/games/current")

    assert event_response.status_code == 200
    assert event_response.json()["success"] is True
    assert events_response.status_code == 200
    assert events_response.json()["events"][-1]["text"] == "At E5"
    assert default_objectives.status_code == 200
    assert default_objectives.json()["objectives"][0]["tier"] == "primary"
    assert objectives_response.status_code == 200
    assert objectives_response.json()["objectives"][0]["text"] == "Reach Pewter City"
    assert control_default.status_code == 200
    assert control_default.json()["state"] == "stopped"
    assert control_response.status_code == 200
    assert control_response.json()["state"] == "running"
    assert game_response.status_code == 200
    active = game_response.json()["active"]
    assert active["id"] == "local"
    assert active["game"] == "red"
    assert active["objectives"][0]["text"] == "Reach Pewter City"
    assert active["stats"]["actions"] == 0


def test_control_rejects_invalid_state(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    response = client.post("/control", json={"state": "sideways"})

    assert response.status_code in {400, 422}
