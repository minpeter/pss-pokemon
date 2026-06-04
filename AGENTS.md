# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-04 18:57:14 KST
**Commit:** 2475ad3 (dirty worktree)
**Branch:** main

## OVERVIEW

Pokemon Red/Blue harness with a Python 3.13 FastAPI/PyBoy backend and Bun
TypeScript terminal clients for human keyboard control and action-only agent
control. The repo is intentionally not a root package-manager workspace; run
package commands from `backend/` or `cli/`, or run `./scripts/check.sh`.

## STRUCTURE

```text
.
|-- backend/      # FastAPI app, PyBoy/fake emulators, Pydantic models, pytest
|-- cli/          # Bun TS human CLI, agent CLI, Zod API mirror, renderer/tests
|-- scripts/      # Root orchestration only
|-- .github/      # CI mirrors scripts/check.sh on Ubuntu and macOS
|-- .env.example  # Runtime env names; never real secrets or ROM paths
`-- README.md     # User setup, run, API, smoke-test commands
```

Treat `.omo/`, virtualenvs, caches, `node_modules`, ROMs, saves, save-states,
and `.local/agent-memory` as local artifacts unless the user explicitly asks.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Compose backend app | `backend/src/pokemon_harness/app.py` | `create_app()` wires route groups, lock, dashboard, save store, and lease. |
| Real ROM backend | `backend/src/pokemon_harness/main.py` | Requires `POKEMON_ROM_PATH`; optional `POKEMON_SAVE_STATE_PATH`. |
| ROM-less backend | `backend/src/pokemon_harness/fake_main.py` | Uses `FakeEmulator` and `.local/saves`. |
| Backend API models | `backend/src/pokemon_harness/schemas.py` | Frozen Pydantic models with camelCase aliases. |
| Backend action schema | `backend/src/pokemon_harness/action_schemas.py` | Typed sequence plus Nous-style token normalization. |
| Gen 1 RAM/state | `backend/src/pokemon_harness/state_parser.py`, `gen1_collision.py` | Parser warnings and centered collision grid. |
| Dashboard routes | `backend/src/pokemon_harness/dashboard_routes.py`, `dashboard_state.py` | Local event/objective/control surfaces for agent view. |
| Human CLI | `cli/src/main.ts`, `human-control-plane.ts` | Raw terminal keys through shared control loop. |
| Agent CLI | `cli/src/agent-main.ts` | Env, terminal view, file-backed memory, runtime wiring. |
| PSS actor | `cli/src/pss-runtime-actor.ts` | Instructions, fresh observation hook, tool choice, dashboard forwarding. |
| Shared control loop | `cli/src/pokemon-control-loop.ts` | Lease heartbeat/release, fresh observation each turn, actor dispatch. |
| Agent tools | `cli/src/agent-tools.ts` | `use_emulator` only; no reset/load/save/ROM controls. |
| Agent memory | `cli/src/agent-memory*.ts` | Recent actions, failed movement warnings, projection/file store. |
| CLI API mirror | `cli/src/schemas.ts`, `api-client.ts` | Zod parsing at HTTP edge; keep aliases in sync with backend. |
| Full checks | `scripts/check.sh` | Backend lint/typecheck/tests, then CLI install/lint/typecheck/tests. |

## CODE MAP

| Symbol | Type | Location | Role |
| --- | --- | --- | --- |
| `create_app` | function | `backend/src/pokemon_harness/app.py` | FastAPI composition root and test injection point. |
| `HarnessEmulator` | protocol | `backend/src/pokemon_harness/emulator.py` | Real/fake emulator boundary. |
| `ActionRequest` | model | `backend/src/pokemon_harness/action_schemas.py` | Server-side action contract and token normalization. |
| `GameState` | model | `backend/src/pokemon_harness/schemas.py` | Shared state rendered by CLI and injected to agent. |
| `parse_pyboy_state` | function | `backend/src/pokemon_harness/state_parser.py` | Gen 1 RAM parser with warnings instead of hard failures. |
| `collision_from_memory` | function | `backend/src/pokemon_harness/gen1_collision.py` | Centered 10x9 passability grid and direction summary. |
| `PokemonApiClient` | class | `cli/src/api-client.ts` | Zod-parsed HTTP client for backend responses. |
| `runPokemonControlLoop` | function | `cli/src/pokemon-control-loop.ts` | Shared always-on controller loop. |
| `createPssRuntimeActor` | function | `cli/src/pss-runtime-actor.ts` | PSS session, fresh observations, tools, and event stream. |
| `createPokemonControlPlane` | function | `cli/src/agent-tools.ts` | Agent-visible action-only tool set. |
| `createFilePokemonAgentMemory` | function | `cli/src/agent-memory-file-store.ts` | Session-scoped projection and episode JSONL under `.local/agent-memory`. |

## CROSS-SURFACE CONTRACTS

- Start a backend before either CLI; default URL is `http://127.0.0.1:8765`.
- Use `pokemon_harness.fake_main:app` for ROM-less HTTP and CLI smoke checks.
- Use `pokemon_harness.main:app` only with a legal ROM outside the repo.
- Keep backend Pydantic models and CLI Zod schemas synchronized on camelCase JSON:
  `controllerId`, `pressFrames`, `waitFrames`, `maxPresses`, `romLoaded`,
  `saveStateLoaded`, `frameBefore`, `frameAfter`, `lastAction`,
  `parserWarnings`, and `pngBase64`.
- `/action` accepts `sequence` steps: `button`, `wait`, `walk`, `hold`,
  `text_skip_until_dialog_end`; backend and CLI also accept `actions` tokens
  such as `press_a`, `walk_up`, `wait_60`, `hold_a_30`, and
  `a_until_dialog_end`.
- Controller ownership is a live lease in one backend runtime. Human uses
  `manual-cli`; agent defaults to `agent-cli`; a second live controller should
  get HTTP 409 or `ControllerConflictError`, while stale leases expire.
- Agent control must remain action-only. Do not expose reset, load, save, ROM
  loading, or save-state controls to the agent tool plane.
- Agent runtime is designed to continue until interrupted. `maxTurns` is for
  tests or injected callers, not a user-facing CLI completion mode.
- Each agent turn should receive fresh state, current screenshot, and grid
  screenshot before `session.send()`.
- Agent memory is advisory context only; it must not bypass live observation or
  action verification.

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
POKEMON_AI_MODEL=human POKEMON_BACKEND_URL=http://127.0.0.1:8765 bun run agent
```

## MANUAL QA

For no-ROM checks, start the fake backend and smoke `/health`, `/state`,
`/screenshot`, `/screenshot?format=base64`, `/screenshot/grid?scale=4`,
`/map/ascii`, and `POST /action`. For real-ROM checks, set `POKEMON_ROM_PATH`
and optionally `POKEMON_SAVE_STATE_PATH`, then run
`uv run python -m pokemon_harness.preflight`.

## DO NOT COMMIT

Do not commit `.env`, `.local/`, `.omo/`, `*.gb`, `*.gbc`, `*.sav`, `*.state`,
`backend/.venv/`, backend caches, Python `__pycache__`, `cli/node_modules/`,
`cli/dist/`, `cli/coverage/`, `*.tsbuildinfo`, or agent memory JSON/JSONL.
