# PROJECT KNOWLEDGE BASE

## OVERVIEW

Pokemon Red/Blue harness with a Bun ESM TypeScript package at the repository
root and a Python 3.13 FastAPI/PyBoy backend in `backend/`. The root package
owns the human CLI, agent CLI, Zod API mirror, renderer, trace tooling, and
tests. Run Bun package commands from the repository root; run backend commands
from `backend/`, or run `./scripts/check.sh` for the full gate.

## STRUCTURE

```text
.
|-- src/          # Bun TS CLI, agent runtime, Zod API mirror, renderer/tests
|-- backend/      # FastAPI app, PyBoy/fake emulators, Pydantic models, pytest
|-- scripts/      # Root orchestration only
|-- test-fixtures/# ABI and trace fixtures shared by root TS tests
|-- docs/         # Trace corpus and benchmark adapter notes
|-- .github/      # CI mirrors scripts/check.sh on Ubuntu and macOS
`-- package.json  # Root Bun package for CLI/runtime tooling
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
| Human CLI | `src/main.ts`, `src/human-control-plane.ts` | Raw terminal keys through shared control loop. |
| Agent CLI | `src/agent-main.ts` | Env, terminal view, file-backed memory, runtime wiring. |
| Agent env | `src/agent-env.ts`, `src/env-files.ts` | Loads root `.env` and `backend/.env`; later files win. |
| PSS actor | `src/pss-runtime-actor.ts` | Instructions, fresh observation hook, tool choice, dashboard forwarding. |
| Shared control loop | `src/pokemon-control-loop.ts` | Lease heartbeat/release, fresh observation each turn, actor dispatch. |
| Agent tools | `src/agent-tools.ts` | `use_emulator` only; no reset/load/save/ROM controls. |
| Agent memory | `src/agent-memory*.ts` | Recent actions, failed movement warnings, projection/file store. |
| CLI API mirror | `src/schemas.ts`, `src/api-client.ts` | Zod parsing at HTTP edge; keep aliases in sync with backend. |
| Full checks | `scripts/check.sh` | Backend lint/typecheck/tests, then root Bun install/lint/typecheck/tests. |

## CODE MAP

| Symbol | Type | Location | Role |
| --- | --- | --- | --- |
| `create_app` | function | `backend/src/pokemon_harness/app.py` | FastAPI composition root and test injection point. |
| `HarnessEmulator` | protocol | `backend/src/pokemon_harness/emulator.py` | Real/fake emulator boundary. |
| `ActionRequest` | model | `backend/src/pokemon_harness/action_schemas.py` | Server-side action contract and token normalization. |
| `GameState` | model | `backend/src/pokemon_harness/schemas.py` | Shared state rendered by CLI and injected to agent. |
| `parse_pyboy_state` | function | `backend/src/pokemon_harness/state_parser.py` | Gen 1 RAM parser with warnings instead of hard failures. |
| `collision_from_memory` | function | `backend/src/pokemon_harness/gen1_collision.py` | Centered 10x9 passability grid and direction summary. |
| `PokemonApiClient` | class | `src/api-client.ts` | Zod-parsed HTTP client for backend responses. |
| `runPokemonControlLoop` | function | `src/pokemon-control-loop.ts` | Shared always-on controller loop. |
| `createPssRuntimeActor` | function | `src/pss-runtime-actor.ts` | PSS session, fresh observations, tools, and event stream. |
| `createPokemonControlPlane` | function | `src/agent-tools.ts` | Agent-visible action-only tool set. |
| `createFilePokemonAgentMemory` | function | `src/agent-memory-file-store.ts` | Session-scoped projection and episode JSONL under `.local/agent-memory`. |

## TYPESCRIPT CONVENTIONS

- This is a Bun package, not npm/pnpm/yarn. Run Bun commands from repo root.
- TypeScript is strict with `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, and bundler resolution.
- Biome format is 2 spaces, double quotes, no semicolons, 100-column line width.
- Biome enforces no default exports, type-only imports, no explicit `any`, no
  non-null assertions, no parameter reassignment, and no unused imports/vars.
- Keep all backend response parsing at the edge in `PokemonApiClient`.
- Keep `src/schemas.ts` aligned with backend aliases and action variants.
- Tests are colocated as `src/*.test.ts` and use `bun:test`.
- Prefer fake `JsonTransport`, Bun test servers, injected writers, and injected
  renderers over real network or terminal dependencies in unit tests.

## CROSS-SURFACE CONTRACTS

- The CLI manages backend sessions by default. `POKEMON_BACKEND_URL` targets an
  already-running external backend.
- Use `pokemon_harness.fake_main:app` for ROM-less HTTP and CLI smoke checks.
- Use `pokemon_harness.main:app` only with a legal ROM outside the repo.
- Root `.env` and `backend/.env` are the default env files; do not add a
  package-local CLI `.env` assumption.
- Keep backend Pydantic models and CLI Zod schemas synchronized on camelCase JSON:
  `controllerId`, `pressFrames`, `waitFrames`, `maxPresses`, `romLoaded`,
  `saveStateLoaded`, `frameBefore`, `frameAfter`, `lastAction`,
  `parserWarnings`, and `pngBase64`.
- `/action` accepts `sequence` steps: `button`, `wait`, `walk`, `hold`,
  `text_skip_until_dialog_end`; backend and CLI also accept `actions` tokens
  such as `press_a`, `walk_up`, `wait_60`, `hold_a_30`, and
  `a_until_dialog_end`.
- Controller ownership is a live lease in one backend runtime. Human uses
  `manual-cli`; agent defaults to `agent-cli`, except
  `POKEMON_AI_MODEL=human` defaults to `manual-cli`.
- Agent control must remain action-only through `use_emulator({ buttons })`.
  Valid buttons are `a`, `b`, `up`, `down`, `left`, `right`, `start`,
  `select`, and `wait`; `wait` advances two seconds of emulator frames.
- Do not expose reset, load, save, ROM loading, or save-state controls to the
  agent plane.
- Agent runtime is designed to continue until interrupted. `maxTurns` is for
  tests or injected callers, not a user-facing CLI completion mode.
- Each PSS turn must steer fresh observation text plus current screenshot and
  grid/collision screenshot before sending the turn prompt.
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
`uv run python -m pokemon_harness.preflight` from `backend/`.

## DO NOT COMMIT

Do not commit `.env`, `.local/`, `.omo/`, `*.gb`, `*.gbc`, `*.sav`, `*.state`,
`backend/.venv/`, backend caches, Python `__pycache__`, `node_modules/`,
`dist/`, `coverage/`, `*.tsbuildinfo`, or agent memory JSON/JSONL.
