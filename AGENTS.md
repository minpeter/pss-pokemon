# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-04 18:08:44 KST
**Commit:** no commits yet
**Branch:** main

## OVERVIEW

Pokemon Red/Blue harness with a Python 3.13 FastAPI/PyBoy backend and two Bun
TypeScript terminal clients: a human keyboard CLI and an action-only agent CLI.
The repo is intentionally not a root package-manager workspace; use package
commands from `backend/` or `cli/`, or run `./scripts/check.sh` from the root.

## STRUCTURE

```text
.
|-- backend/      # FastAPI app, PyBoy/fake emulators, Pydantic API models, pytest suite
|-- cli/          # Bun TS human CLI, agent CLI, Zod API mirror, renderer/tests
|-- scripts/      # Root orchestration only
|-- .github/      # CI mirrors scripts/check.sh on Ubuntu and macOS
|-- .env.example  # Runtime env names; do not commit real .env files
`-- README.md     # User-facing setup, run, API, and smoke-test commands
```

Treat `.omo/`, virtualenvs, caches, `node_modules`, ROMs, saves, and save-states
as local artifacts unless the user explicitly asks about them.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Compose backend app | `backend/src/pokemon_harness/app.py` | `create_app()` registers all route groups and wires controller lease locking. |
| Real ROM backend | `backend/src/pokemon_harness/main.py` | Requires `POKEMON_ROM_PATH`; optional `POKEMON_SAVE_STATE_PATH`. |
| ROM-less smoke backend | `backend/src/pokemon_harness/fake_main.py` | Uses `FakeEmulator` and `.local/saves`. |
| Backend API models | `backend/src/pokemon_harness/schemas.py` | Frozen Pydantic models with camelCase aliases. |
| Backend action schema | `backend/src/pokemon_harness/action_schemas.py` | Typed sequence plus Nous-style action-token normalization. |
| Human CLI | `cli/src/main.ts` | Raw terminal keys to backend `/action`, then observation rendering. |
| Agent CLI | `cli/src/agent-main.ts` | Env loading, terminal view, and `runAgentControlPlane()`. |
| Shared control loop | `cli/src/pokemon-control-loop.ts` | Fresh observation each turn, controller heartbeat/release, actor turn dispatch. |
| Agent loop | `cli/src/agent-runtime.ts` | PSS runtime actor; loop until interrupted or injected `maxTurns`. |
| Agent tools | `cli/src/agent-tools.ts` | Action-only tools; no reset/load/save/ROM controls. |
| CLI API mirror | `cli/src/schemas.ts` | Keep in sync with backend Pydantic JSON aliases. |
| Full checks | `scripts/check.sh` | Backend lint/typecheck/tests, then CLI install/lint/typecheck/tests. |

## CODE MAP

| Symbol | Type | Location | Role |
| --- | --- | --- | --- |
| `create_app` | function | `backend/src/pokemon_harness/app.py` | FastAPI composition root and dependency injection point for tests. |
| `HarnessEmulator` | protocol | `backend/src/pokemon_harness/emulator.py` | Real/fake emulator boundary. |
| `ActionRequest` | model | `backend/src/pokemon_harness/action_schemas.py` | Server-side action contract and token normalization. |
| `GameState` | model | `backend/src/pokemon_harness/schemas.py` | Shared state shape rendered by CLI and injected to agent. |
| `parse_pyboy_state` | function | `backend/src/pokemon_harness/state_parser.py` | Gen 1 RAM parser with warnings instead of hard failures. |
| `PokemonApiClient` | class | `cli/src/api-client.ts` | Zod-parsed HTTP client for every backend response. |
| `ActionRequestSchema` | Zod schema | `cli/src/schemas.ts` | Client-side mirror of typed and Nous-style action inputs. |
| `runAgentControlPlane` | function | `cli/src/agent-runtime.ts` | PSS runtime loop and observation injection. |
| `createPokemonControlPlane` | function | `cli/src/agent-tools.ts` | Agent-visible action-only tool set. |
| `actionForKey` | function | `cli/src/keymap.ts` | Human key mapping; controller ID is `manual-cli`. |

## CROSS-SURFACE CONTRACTS

- Start a backend before either CLI; default URL is `http://127.0.0.1:8765`.
- Use `pokemon_harness.fake_main:app` for ROM-less HTTP and CLI smoke checks.
- Use `pokemon_harness.main:app` only with a legal ROM outside the repo.
- Keep backend Pydantic models and CLI Zod schemas synchronized on camelCase JSON:
  `controllerId`, `pressFrames`, `waitFrames`, `maxPresses`, `romLoaded`,
  `saveStateLoaded`, `frameBefore`, `frameAfter`, `lastAction`,
  `parserWarnings`, and `pngBase64`.
- `/action` accepts `sequence` steps: `button`, `wait`, `walk`, `hold`,
  `text_skip_until_dialog_end`; both backend and CLI also accept `actions`
  tokens such as `press_a`, `walk_up`, `wait_60`, `hold_a_30`,
  and `a_until_dialog_end`.
- Controller ownership is a live lease in one backend runtime. Human uses
  `manual-cli`; agent defaults to `agent-cli`; a second live controller should
  get HTTP 409 or `ControllerConflictError`, while stale leases expire.
- Agent control must remain action-only. Do not expose reset, load, save, ROM
  loading, or save-state controls to the agent plane.
- Agent runtime is designed to continue until interrupted. `maxTurns` is for
  tests or injected callers, not a user-facing CLI completion mode.

## COMMANDS

```bash
./scripts/check.sh

cd backend
uv run ruff check .
uv run basedpyright
uv run pytest
uv run uvicorn pokemon_harness.fake_main:app --host 127.0.0.1 --port 8765
uv run uvicorn pokemon_harness.main:app --host 127.0.0.1 --port 8765
uv run python -m pokemon_harness.preflight

cd cli
bun install --frozen-lockfile
bunx biome check .
bunx tsc --noEmit
bun test
POKEMON_BACKEND_URL=http://127.0.0.1:8765 bun run human
POKEMON_BACKEND_URL=http://127.0.0.1:8765 bun run agent
```

## MANUAL QA

For no-ROM checks, start the fake backend and smoke `/health`, `/state`,
`/screenshot`, `/screenshot?format=base64`, `/screenshot/grid?scale=4`,
`/map/ascii`, and `POST /action`. For real-ROM checks, set
`POKEMON_ROM_PATH` and optionally `POKEMON_SAVE_STATE_PATH`, then run
`uv run python -m pokemon_harness.preflight`.

## DO NOT COMMIT

Do not commit `.env`, `.local/`, `*.gb`, `*.gbc`, `*.sav`, `*.state`,
`backend/.venv/`, backend caches, Python `__pycache__`, `cli/node_modules/`,
`cli/dist/`, `cli/coverage/`, or `*.tsbuildinfo`.
