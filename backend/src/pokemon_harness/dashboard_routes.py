from typing import Protocol

from fastapi import FastAPI

from pokemon_harness.dashboard_state import (
    ControlRequest,
    ControlResponse,
    ControlUpdateResponse,
    CurrentGameResponse,
    DashboardState,
    EventRequest,
    EventsResponse,
    EventWriteResponse,
    ObjectivesRequest,
    ObjectivesResponse,
    ObjectivesUpdateResponse,
)


class DashboardRuntime(Protocol):
    dashboard: DashboardState


def register_dashboard_routes(app: FastAPI, runtime: DashboardRuntime) -> None:
    @app.post("/event")
    def event(payload: EventRequest) -> EventWriteResponse:
        runtime.dashboard.append_event(payload)
        return EventWriteResponse(success=True, broadcastTo=0)

    @app.get("/events")
    def events() -> EventsResponse:
        return EventsResponse(events=tuple(runtime.dashboard.events))

    @app.get("/objectives")
    def objectives() -> ObjectivesResponse:
        return ObjectivesResponse(objectives=runtime.dashboard.objectives)

    @app.post("/objectives")
    def set_objectives(payload: ObjectivesRequest) -> ObjectivesUpdateResponse:
        runtime.dashboard.objectives = payload.objectives
        return ObjectivesUpdateResponse(success=True, objectives=runtime.dashboard.objectives)

    @app.get("/control")
    def control() -> ControlResponse:
        return ControlResponse(state=runtime.dashboard.control_state)

    @app.post("/control")
    def set_control(payload: ControlRequest) -> ControlUpdateResponse:
        runtime.dashboard.control_state = payload.state
        return ControlUpdateResponse(success=True, state=runtime.dashboard.control_state)

    @app.get("/games/current")
    def current_game() -> CurrentGameResponse:
        return CurrentGameResponse(active=runtime.dashboard.active_game())
