from typing import Protocol

from pokemon_harness.schemas import ActionRequest, GameState, Observation


class HarnessEmulator(Protocol):
    @property
    def frame(self) -> int:
        ...

    @property
    def rom_loaded(self) -> bool:
        ...

    @property
    def save_state_loaded(self) -> bool:
        ...

    def state(self) -> GameState:
        ...

    def screenshot_png(self) -> bytes:
        ...

    def screenshot_size(self) -> tuple[int, int]:
        ...

    def observe(self, last_action: ActionRequest | None) -> Observation:
        ...

    def perform(self, action: ActionRequest) -> Observation:
        ...

    def save_state_bytes(self) -> bytes:
        ...

    def load_state_bytes(self, payload: bytes) -> None:
        ...

    def reset_rom(self) -> None:
        ...

    def reset_to_initial_save_state(self) -> None:
        ...
