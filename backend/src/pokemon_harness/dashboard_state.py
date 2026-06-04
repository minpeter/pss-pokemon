from collections import deque
from datetime import UTC, datetime
from typing import ClassVar, Literal, final

from pydantic import BaseModel, ConfigDict, Field


class Objective(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    tier: Literal["primary", "secondary", "tertiary"]
    text: str = Field(min_length=1)
    done: bool = False


class ObjectivesRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    objectives: tuple[Objective, ...] = Field(min_length=1)


class ControlRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    state: Literal["running", "paused", "stopped"]


class EventRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    type: Literal["reasoning", "decision", "key_moment", "alert", "battle", "action"]
    text: str | None = None
    description: str | None = None
    category: str | None = None


class EventRecord(EventRequest):
    ts: float


class EventWriteResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    success: bool
    broadcast_to: int = Field(alias="broadcastTo")


class EventsResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    events: tuple[EventRecord, ...]


class ObjectivesResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    objectives: tuple[Objective, ...]


class ObjectivesUpdateResponse(ObjectivesResponse):
    success: bool


type ControlState = Literal["running", "paused", "stopped"]


class ControlResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    state: ControlState


class ControlUpdateResponse(ControlResponse):
    success: bool


class GameStats(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    turns: int
    actions: int
    blackouts: int
    saves: int


class ActiveGame(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    id: str
    name: str
    game: str
    objectives: tuple[Objective, ...]
    stats: GameStats


class CurrentGameResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    active: ActiveGame


DEFAULT_OBJECTIVES = (
    Objective(tier="primary", text="Deliver Oak's Parcel and get Pokedex"),
    Objective(tier="secondary", text="Reach Pewter City and prepare for Brock"),
    Objective(tier="tertiary", text="Keep party healthy while exploring"),
)


@final
class DashboardState:
    __slots__: ClassVar[tuple[str, ...]] = (
        "actions",
        "control_state",
        "events",
        "objectives",
        "turns",
    )

    events: deque[EventRecord]
    objectives: tuple[Objective, ...]
    control_state: ControlState
    turns: int
    actions: int

    def __init__(self) -> None:
        self.events = deque(maxlen=200)
        self.objectives = DEFAULT_OBJECTIVES
        self.control_state = "stopped"
        self.turns = 0
        self.actions = 0

    def append_event(self, event: EventRequest) -> None:
        self.events.append(
            EventRecord(
                type=event.type,
                text=event.text,
                description=event.description,
                category=event.category,
                ts=datetime.now(UTC).timestamp(),
            )
        )

    def record_actions(self, count: int) -> None:
        self.turns += 1
        self.actions += count

    def active_game(self) -> ActiveGame:
        return ActiveGame(
            id="local",
            name="Local Harness",
            game="red",
            objectives=self.objectives,
            stats=GameStats(turns=self.turns, actions=self.actions, blackouts=0, saves=0),
        )
