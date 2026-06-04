from typing import Annotated, ClassVar

from fastapi import FastAPI, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from pokemon_harness.emulator import HarnessEmulator
from pokemon_harness.gen1_collision import PLAYER_CELL, render_ascii_map
from pokemon_harness.grid_overlay import render_grid_overlay_png


class AsciiMapResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, populate_by_name=True)

    ascii: str
    player_cell: str = Field(default=PLAYER_CELL, alias="playerCell")
    passable_directions: tuple[str, ...] = Field(alias="passableDirections")


GridScale = Annotated[int, Query(ge=1, le=8)]


def register_navigation_routes(app: FastAPI, emulator: HarnessEmulator) -> None:
    @app.get("/map/ascii")
    def map_ascii() -> AsciiMapResponse:
        collision = emulator.state().collision
        ascii_map = (
            collision.ascii if collision.ascii is not None else render_ascii_map(collision.grid)
        )
        return AsciiMapResponse(
            ascii=ascii_map,
            playerCell=collision.player_cell or PLAYER_CELL,
            passableDirections=collision.passable_directions,
        )

    @app.get("/screenshot/grid", response_model=None)
    def screenshot_grid(scale: GridScale = 4) -> Response:
        state = emulator.state()
        png = render_grid_overlay_png(
            screenshot_png=emulator.screenshot_png(),
            walkable=state.collision.grid,
            scale=scale,
        )
        return Response(content=png, media_type="image/png")
