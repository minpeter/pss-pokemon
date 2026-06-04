from collections.abc import Callable
from typing import Final, final

Clock = Callable[[], float]
DEFAULT_CONTROLLER_LEASE_SECONDS: Final = 5.0


@final
class InvalidControllerLeaseSecondsError(ValueError):
    def __init__(self, lease_seconds: float) -> None:
        self.lease_seconds = lease_seconds
        super().__init__(f"controller lease seconds must be positive: {lease_seconds}")


@final
class ControllerLease:
    __slots__ = ("_active_controller_id", "_clock", "_expires_at", "_lease_seconds")

    _active_controller_id: str | None
    _clock: Clock
    _expires_at: float | None
    _lease_seconds: float

    def __init__(self, *, clock: Clock, lease_seconds: float) -> None:
        if lease_seconds <= 0:
            raise InvalidControllerLeaseSecondsError(lease_seconds)
        self._active_controller_id = None
        self._clock = clock
        self._expires_at = None
        self._lease_seconds = lease_seconds

    def active_controller_id(self) -> str | None:
        self._expire_if_needed()
        return self._active_controller_id

    def claim(self, controller_id: str) -> bool:
        self._expire_if_needed()
        if self._active_controller_id is not None and self._active_controller_id != controller_id:
            return False
        self._active_controller_id = controller_id
        self._expires_at = self._clock() + self._lease_seconds
        return True

    def release(self, controller_id: str) -> bool:
        self._expire_if_needed()
        if self._active_controller_id != controller_id:
            return False
        self._active_controller_id = None
        self._expires_at = None
        return True

    def _expire_if_needed(self) -> None:
        if self._expires_at is not None and self._clock() >= self._expires_at:
            self._active_controller_id = None
            self._expires_at = None
