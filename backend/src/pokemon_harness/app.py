import threading
from pathlib import Path
from time import monotonic
from typing import Annotated, ClassVar, Literal, final

import anyio
from fastapi import FastAPI, HTTPException, Query, Response, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, ConfigDict

from pokemon_harness.action_supervisor import UnsafeActionSequenceError, supervise_action_request
from pokemon_harness.config import HarnessSettings
from pokemon_harness.controller_lease import (
    DEFAULT_CONTROLLER_LEASE_SECONDS,
    Clock,
    ControllerLease,
)
from pokemon_harness.dashboard_routes import register_dashboard_routes
from pokemon_harness.dashboard_state import DashboardState
from pokemon_harness.emulator import HarnessEmulator
from pokemon_harness.navigation_routes import register_navigation_routes
from pokemon_harness.pyboy_emulator import PyBoyEmulator
from pokemon_harness.save_store import (
    DuplicateSaveError,
    InvalidSaveNameError,
    MissingSaveError,
    SaveStore,
)
from pokemon_harness.schemas import (
    ActionRequest,
    ActionResponse,
    ControlLeaseResponse,
    ControlRequest,
    GameState,
    HealthResponse,
    LoadRequest,
    ResetRequest,
    SaveRequest,
    SavesResponse,
    ScreenshotBase64Response,
)


@final
class HarnessRuntime:
    __slots__: ClassVar[tuple[str, ...]] = (
        "controller_lease",
        "dashboard",
        "emulator",
        "lock",
        "save_store",
    )

    emulator: HarnessEmulator
    save_store: SaveStore
    dashboard: DashboardState
    controller_lease: ControllerLease
    lock: threading.Lock

    def __init__(
        self,
        *,
        emulator: HarnessEmulator,
        save_store: SaveStore,
        dashboard: DashboardState,
        controller_lease: ControllerLease,
        lock: threading.Lock,
    ) -> None:
        self.emulator = emulator
        self.save_store = save_store
        self.dashboard = dashboard
        self.controller_lease = controller_lease
        self.lock = lock


class CommandStatusResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    status: str
    name: str | None = None
    mode: str | None = None


ScreenshotFormat = Annotated[Literal["png", "base64"], Query(alias="format")]
WebSocketRole = Annotated[Literal["controller", "observer"], Query(alias="role")]


def create_app(
    *,
    clock: Clock = monotonic,
    controller_lease_seconds: float = DEFAULT_CONTROLLER_LEASE_SECONDS,
    emulator: HarnessEmulator | None = None,
    save_store: SaveStore | None = None,
    settings: HarnessSettings | None = None,
) -> FastAPI:
    resolved_settings = settings if settings is not None else HarnessSettings()
    resolved_emulator = (
        emulator if emulator is not None else _create_real_emulator(resolved_settings)
    )
    runtime = HarnessRuntime(
        emulator=resolved_emulator,
        save_store=save_store if save_store is not None else SaveStore(root=Path(".local/saves")),
        dashboard=DashboardState(),
        controller_lease=ControllerLease(clock=clock, lease_seconds=controller_lease_seconds),
        lock=threading.Lock(),
    )
    app = FastAPI()
    _register_observation_routes(app=app, runtime=runtime)
    register_navigation_routes(app=app, emulator=runtime.emulator)
    register_dashboard_routes(app=app, runtime=runtime)
    _register_control_routes(app=app, runtime=runtime)
    _register_action_routes(app=app, runtime=runtime)
    _register_save_routes(app=app, runtime=runtime)
    _register_websocket_route(app=app, runtime=runtime)
    return app


def _register_observation_routes(app: FastAPI, runtime: HarnessRuntime) -> None:
    @app.get("/health")
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            romLoaded=runtime.emulator.rom_loaded,
            saveStateLoaded=runtime.emulator.save_state_loaded,
            frame=runtime.emulator.frame,
            activeControllerId=runtime.controller_lease.active_controller_id(),
        )

    @app.get("/state")
    def state() -> GameState:
        return runtime.emulator.state()

    @app.get("/screenshot", response_model=None)
    def screenshot(image_format: ScreenshotFormat = "png") -> Response | ScreenshotBase64Response:
        if image_format == "png":
            return Response(content=runtime.emulator.screenshot_png(), media_type="image/png")

        observation = runtime.emulator.observe(last_action=None)
        return ScreenshotBase64Response(
            pngBase64=observation.screenshot.png_base64,
            frame=runtime.emulator.frame,
        )


def _register_action_routes(app: FastAPI, runtime: HarnessRuntime) -> None:
    @app.post("/action")
    def action(payload: ActionRequest) -> ActionResponse:
        with runtime.lock:
            active_controller_id = runtime.controller_lease.active_controller_id()
            if active_controller_id is not None and active_controller_id != payload.controller_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="another controller is active",
                )
            try:
                supervised_payload = supervise_action_request(payload)
            except UnsafeActionSequenceError as error:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=str(error),
                ) from error
            _ = runtime.controller_lease.claim(payload.controller_id)
            frame_before = runtime.emulator.frame
            observation = runtime.emulator.perform(supervised_payload)
            runtime.dashboard.record_actions(len(supervised_payload.sequence))
            return ActionResponse(
                accepted=True,
                frameBefore=frame_before,
                frameAfter=runtime.emulator.frame,
                observation=observation,
            )


def _register_control_routes(app: FastAPI, runtime: HarnessRuntime) -> None:
    @app.post("/control/heartbeat")
    def heartbeat(payload: ControlRequest) -> ControlLeaseResponse:
        with runtime.lock:
            if not runtime.controller_lease.claim(payload.controller_id):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="another controller is active",
                )
            return ControlLeaseResponse(
                status="active",
                activeControllerId=runtime.controller_lease.active_controller_id(),
            )

    @app.post("/control/release")
    def release(payload: ControlRequest) -> ControlLeaseResponse:
        with runtime.lock:
            released = runtime.controller_lease.release(payload.controller_id)
            return ControlLeaseResponse(
                status="released" if released else "ignored",
                activeControllerId=runtime.controller_lease.active_controller_id(),
            )


def _register_save_routes(app: FastAPI, runtime: HarnessRuntime) -> None:
    @app.get("/saves")
    def saves() -> SavesResponse:
        return SavesResponse(saves=runtime.save_store.list())

    @app.post("/save")
    def save(payload: SaveRequest) -> CommandStatusResponse:
        try:
            _ = runtime.save_store.save_bytes(
                name=payload.name,
                payload=runtime.emulator.save_state_bytes(),
                overwrite=payload.overwrite,
            )
        except DuplicateSaveError as error:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
        except InvalidSaveNameError as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(error),
            ) from error
        return CommandStatusResponse(status="saved", name=payload.name)

    @app.post("/load")
    def load(payload: LoadRequest) -> CommandStatusResponse:
        try:
            saved = runtime.save_store.require(payload.name)
        except (InvalidSaveNameError, MissingSaveError) as error:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
        runtime.emulator.load_state_bytes(saved.path.read_bytes())
        return CommandStatusResponse(status="loaded", name=payload.name)

    @app.post("/reset")
    def reset(payload: ResetRequest) -> CommandStatusResponse:
        if payload.mode == "rom":
            runtime.emulator.reset_rom()
        else:
            runtime.emulator.reset_to_initial_save_state()
        return CommandStatusResponse(status="reset", mode=payload.mode)


def _register_websocket_route(app: FastAPI, runtime: HarnessRuntime) -> None:
    @app.websocket("/ws")
    async def websocket(websocket: WebSocket, _role: WebSocketRole = "observer") -> None:
        await websocket.accept()
        try:
            while True:
                observation = runtime.emulator.observe(last_action=None)
                await websocket.send_json(
                    observation.model_dump(mode="json", by_alias=True)
                )
                await anyio.sleep(1)
        except WebSocketDisconnect:
            return


def _create_real_emulator(settings: HarnessSettings) -> HarnessEmulator:
    paths = settings.require_real_rom_paths()
    return PyBoyEmulator(rom_path=paths.rom_path, save_state_path=paths.save_state_path)
