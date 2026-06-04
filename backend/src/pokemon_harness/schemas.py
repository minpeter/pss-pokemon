from datetime import UTC, datetime
from typing import Literal

from pydantic import Field

from pokemon_harness.action_schemas import (
    ActionRequest,
    ActionStep,
    Button,
    ButtonStep,
    HoldStep,
    TextSkipUntilDialogEndStep,
    WaitStep,
    WalkStep,
)
from pokemon_harness.model_base import HarnessModel

__all__ = (
    "ActionRequest",
    "ActionResponse",
    "ActionStep",
    "BadgesState",
    "BagItem",
    "BattleEnemy",
    "BattleState",
    "Button",
    "ButtonStep",
    "CollisionState",
    "ControlLeaseResponse",
    "ControlRequest",
    "DialogState",
    "EmulatorState",
    "FlagsState",
    "GameState",
    "HealthResponse",
    "HoldStep",
    "LoadRequest",
    "MapState",
    "Observation",
    "PartyMember",
    "PartyStats",
    "PlayerState",
    "Position",
    "ResetRequest",
    "SaveEntryResponse",
    "SaveRequest",
    "SavesResponse",
    "Screenshot",
    "ScreenshotBase64Response",
    "TextSkipUntilDialogEndStep",
    "WaitStep",
    "WalkStep",
)


class Position(HarnessModel):
    x: int
    y: int


class EmulatorState(HarnessModel):
    frame: int
    rom_loaded: bool = Field(alias="romLoaded")
    save_state_loaded: bool = Field(alias="saveStateLoaded")


class PlayerState(HarnessModel):
    name: str | None
    tile: Position | None
    facing: str | None
    rival_name: str | None = Field(default=None, alias="rivalName")
    money: int | None = None
    play_time: str | None = Field(default=None, alias="playTime")
    pokedex_owned: int | None = Field(default=None, alias="pokedexOwned")
    pokedex_seen: int | None = Field(default=None, alias="pokedexSeen")


class MapState(HarnessModel):
    id: int | None
    name: str | None


class PartyStats(HarnessModel):
    attack: int
    defense: int
    speed: int
    special: int


class PartyMember(HarnessModel):
    species: str | None
    level: int | None
    hp: int | None
    max_hp: int | None = Field(alias="maxHp")
    status: str | None
    nickname: str | None = None
    types: tuple[str, ...] = ()
    moves: tuple[str, ...] = ()
    stats: PartyStats | None = None


class BagItem(HarnessModel):
    name: str
    quantity: int


class BadgesState(HarnessModel):
    owned: tuple[str, ...]


class BattleEnemy(HarnessModel):
    species: str | None
    level: int | None
    hp: int | None
    max_hp: int | None = Field(alias="maxHp")
    status: str | None
    moves: tuple[str, ...] = ()


class BattleState(HarnessModel):
    active: bool
    kind: str | None
    opponent: str | None
    enemy: BattleEnemy | None = None


class DialogState(HarnessModel):
    active: bool
    text: str | None


class FlagsState(HarnessModel):
    values: dict[str, bool]


class CollisionState(HarnessModel):
    map_id: int | None = Field(alias="mapId")
    map_name: str | None = Field(alias="mapName")
    width: int
    height: int
    grid: tuple[tuple[bool, ...], ...]
    player_tile: Position | None = Field(alias="playerTile")
    passable_directions: tuple[str, ...] = Field(alias="passableDirections")
    ascii: str | None = None
    player_cell: str | None = Field(default=None, alias="playerCell")


class GameState(HarnessModel):
    emulator: EmulatorState
    player: PlayerState
    map: MapState
    party: tuple[PartyMember, ...]
    bag: tuple[BagItem, ...]
    badges: BadgesState
    battle: BattleState
    dialog: DialogState
    flags: FlagsState
    collision: CollisionState
    parser_warnings: tuple[str, ...] = Field(alias="parserWarnings")


class Screenshot(HarnessModel):
    png_base64: str = Field(alias="pngBase64")
    width: int
    height: int


class Observation(HarnessModel):
    type: Literal["observation"] = "observation"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    frame: int
    state: GameState
    screenshot: Screenshot
    last_action: ActionRequest | None = Field(default=None, alias="lastAction")
    parser_warnings: tuple[str, ...] = Field(alias="parserWarnings")


class ActionResponse(HarnessModel):
    accepted: bool
    frame_before: int = Field(alias="frameBefore")
    frame_after: int = Field(alias="frameAfter")
    observation: Observation


class HealthResponse(HarnessModel):
    status: Literal["ok"]
    rom_loaded: bool = Field(alias="romLoaded")
    save_state_loaded: bool = Field(alias="saveStateLoaded")
    frame: int
    active_controller_id: str | None = Field(alias="activeControllerId")


class ControlRequest(HarnessModel):
    controller_id: str = Field(alias="controllerId", min_length=1)


class ControlLeaseResponse(HarnessModel):
    status: Literal["active", "released", "ignored"]
    active_controller_id: str | None = Field(alias="activeControllerId")


class SaveRequest(HarnessModel):
    name: str = Field(min_length=1)
    overwrite: bool = False


class LoadRequest(HarnessModel):
    name: str = Field(min_length=1)


class ResetRequest(HarnessModel):
    mode: Literal["rom", "initial_save_state"]


class SaveEntryResponse(HarnessModel):
    name: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class SavesResponse(HarnessModel):
    saves: tuple[SaveEntryResponse, ...]


class ScreenshotBase64Response(HarnessModel):
    png_base64: str = Field(alias="pngBase64")
    frame: int
