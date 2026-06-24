from pathlib import Path
from typing import final, override

from fastapi.testclient import TestClient

from pokemon_harness.app import create_app
from pokemon_harness.fake_emulator import FakeEmulator
from pokemon_harness.save_store import SaveStore
from pokemon_harness.schemas import DialogState, GameState


class DialogClearingFakeEmulator(FakeEmulator):
    @override
    def state(self) -> GameState:
        state = super().state()
        return state.model_copy(
            update={"dialog": DialogState(active=self.frame < 132, text=None)},
        )


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


def test_action_supervisor_rejects_unsafe_sequence_without_claiming_controller(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    unsafe = client.post(
        "/action",
        json={
            "controllerId": "manual-cli",
            "sequence": [
                {"type": "hold", "button": "a", "frames": 30},
                {"type": "hold", "button": "b", "frames": 30},
            ],
        },
    )
    reclaimed = client.post(
        "/action",
        json={"controllerId": "agent-cli", "sequence": [{"type": "wait", "frames": 1}]},
    )

    assert unsafe.status_code == 422
    assert "multiple hold" in unsafe.json()["detail"]
    assert reclaimed.status_code == 200


def test_action_supervisor_preserves_controller_conflict_status(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    active = client.post(
        "/action",
        json={"controllerId": "manual-cli", "sequence": [{"type": "wait", "frames": 1}]},
    )
    unsafe_competing = client.post(
        "/action",
        json={
            "controllerId": "agent-cli",
            "sequence": [
                {"type": "hold", "button": "a", "frames": 30},
                {"type": "hold", "button": "b", "frames": 30},
            ],
        },
    )

    assert active.status_code == 200
    assert unsafe_competing.status_code == 409
    assert unsafe_competing.json()["detail"] == "another controller is active"


def test_action_supervisor_normalizes_route_action_and_observation(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    response = client.post(
        "/action",
        json={
            "controllerId": "manual-cli",
            "sequence": [{"type": "walk", "direction": "up", "pressFrames": 60, "waitFrames": 600}],
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert body["frameBefore"] == 0
    assert body["frameAfter"] == 20
    assert body["observation"]["frame"] == body["frameAfter"]
    assert body["observation"]["lastAction"]["sequence"] == [
        {"type": "walk", "direction": "up", "pressFrames": 8, "waitFrames": 12},
    ]


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


def test_controller_heartbeat_release_semantics(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    manual = client.post("/control/heartbeat", json={"controllerId": "manual-cli"})
    blocked_agent = client.post("/control/heartbeat", json={"controllerId": "agent-cli"})
    ignored_release = client.post("/control/release", json={"controllerId": "agent-cli"})
    blocked_action = client.post(
        "/action",
        json={"controllerId": "agent-cli", "sequence": [{"type": "wait", "frames": 1}]},
    )
    release_manual = client.post("/control/release", json={"controllerId": "manual-cli"})
    agent_after_release = client.post(
        "/action",
        json={"controllerId": "agent-cli", "sequence": [{"type": "wait", "frames": 1}]},
    )

    assert manual.status_code == 200
    assert manual.json()["activeControllerId"] == "manual-cli"
    assert blocked_agent.status_code == 409
    assert ignored_release.status_code == 200
    assert ignored_release.json() == {"status": "ignored", "activeControllerId": "manual-cli"}
    assert blocked_action.status_code == 409
    assert release_manual.status_code == 200
    assert release_manual.json() == {"status": "released", "activeControllerId": None}
    assert agent_after_release.status_code == 200


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
