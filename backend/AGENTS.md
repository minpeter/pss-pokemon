# BACKEND KNOWLEDGE BASE

Scope: `backend/`

## OVERVIEW

Python 3.13 FastAPI backend for Pokemon Red/Blue state, screenshots, actions,
saves, navigation overlays, and dashboard surfaces. Real mode wraps PyBoy; fake
mode provides deterministic ROM-less smoke coverage.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| App composition | `src/pokemon_harness/app.py` | `create_app()` wires all route groups and accepts emulator/save-store injection. |
| Controller lease | `src/pokemon_harness/controller_lease.py` | Live controller ownership with expiry for dead CLI processes. |
| Real entrypoint | `src/pokemon_harness/main.py` | Calls `create_app()` and requires real ROM settings. |
| Fake entrypoint | `src/pokemon_harness/fake_main.py` | Uses `FakeEmulator` and `.local/saves`. |
| Settings/preflight | `src/pokemon_harness/config.py`, `preflight.py` | `POKEMON_` env prefix; real ROM path validation. |
| Emulator protocol | `src/pokemon_harness/emulator.py` | Boundary shared by PyBoy and fake implementations. |
| PyBoy adapter | `src/pokemon_harness/pyboy_emulator.py` | Keep import/runtime details isolated here. |
| Fake emulator | `src/pokemon_harness/fake_emulator.py` | Deterministic frames, state, screenshot, and save bytes. |
| API models | `src/pokemon_harness/schemas.py`, `model_base.py` | Frozen alias-aware Pydantic models. |
| Action models | `src/pokemon_harness/action_schemas.py` | Discriminated actions and Nous token normalization. |
| Gen 1 parser | `src/pokemon_harness/state_parser.py`, `gen1_ram_details.py` | RAM parsing with warnings and clamped counts. |
| Catalog/collision | `src/pokemon_harness/gen1_catalog.py`, `gen1_collision.py`, `gen1_maps.py` | Text/catalog lookup and passability grid. |
| Navigation | `src/pokemon_harness/navigation_routes.py`, `grid_overlay.py` | `/map/ascii` and `/screenshot/grid`. |
| Dashboard | `src/pokemon_harness/dashboard_routes.py`, `dashboard_state.py` | Agent event/objective/control surfaces. |
| Tests | `tests/` | Route, schema, parser, collision, save, dashboard, and preflight tests. |

## CONVENTIONS

- Run backend commands from `backend/`; use `uv`, not a root workspace command.
- Keep `HarnessModel` models frozen, alias-aware, and compatible with
  `src/schemas.ts`.
- Prefer dependency injection through `create_app(emulator=..., save_store=...)`
  for tests and smoke surfaces.
- Keep real PyBoy code in `pyboy_emulator.py`; keep ROM-less/test behavior in
  `fake_emulator.py`.
- Use `Protocol` for emulator/external boundaries, `Final` for constants,
  frozen slotted dataclasses for small value/error types, and typed exceptions
  with explicit `__str__` when response text matters.
- Preserve `ActionRequest` as a discriminated union over `type` with sequence
  length 1..32.
- Keep Nous-style token normalization mirrored with CLI schemas:
  `press_*`, `walk_*`, `wait_*`, `hold_*_<frames>`, and
  `a_until_dialog_end`.
- Gen 1 RAM parser and collision code should add parser warnings or clamp
  uncertain counts instead of crashing on uncertain bytes.
- `/screenshot` returns raw PNG by default; `/screenshot?format=base64` returns
  JSON. `/screenshot/grid` scale is constrained to 1..8.
- The centered collision overlay uses fixed player cell `E5`.
- Text skip stops early when dialog clears; keep fake and real behavior aligned.
- Controller conflicts should be based on an unexpired lease, not a permanent
  controller ID left behind by a dead process.

## COMMANDS

Run `uv run ruff check .`, `uv run basedpyright`, `uv run pytest`, fake or real
`uv run uvicorn ... --host 127.0.0.1 --port 8765`, and
`uv run python -m pokemon_harness.preflight` from `backend/`.

## TEST PATTERNS

- Route tests should use `fastapi.testclient.TestClient` with `FakeEmulator` and
  `SaveStore(root=tmp_path)` rather than starting a live server.
- Parser and collision tests should use small fake memory fixtures.
- Image route tests should assert actual PNG size and visible/non-trivial pixels
  with Pillow.
- Add focused assertions for status codes, JSON aliases, parser warnings, frame
  advancement, save-name validation, and controller conflict behavior.

## ANTI-PATTERNS

- Do not make tests depend on a real ROM unless the test is explicitly preflight
  or secret-gated CI.
- Do not commit `.env`, `.local/`, ROMs, save files, save-states, `.venv/`,
  caches, `__pycache__`, or generated egg-info.
- Do not let the agent-facing action path reach reset, load, save, ROM loading,
  or save-state controls.
