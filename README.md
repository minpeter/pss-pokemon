# Pokemon TS Harness V1

Pokemon Red/Blue harness with a headless PyBoy backend and a shared TypeScript
control plane for human keyboard play or pss-runtime agent play.

## Scope

V1 keeps observation, terminal rendering, action execution, and verification on
one shared path. The only swapped component is the actor: either a human pressing
keyboard keys, or `@minpeter/pss-runtime@0.0.10` selecting backend action tools.

## Legal ROM Boundary

Provide your own legally obtained Pokemon Red/Blue ROM. Do not commit ROMs,
save files, or save-states. This repo gitignores common ROM and save-state
extensions plus `.local/`.

## Setup

```bash
cp .env.example .env
cd backend && uv run pytest
cd ../cli && bun install && bun test
```

For full real-ROM verification, set:

```bash
export POKEMON_ROM_PATH=/absolute/path/to/pokemon-red-or-blue.gb
# Optional, for deterministic Pallet Town QA:
export POKEMON_SAVE_STATE_PATH=/absolute/path/to/pallet-town.state
# Agent control plane:
export POKEMON_AI_BASE_URL=https://codex.nekos.me/v1
export POKEMON_AI_API_KEY=...
export POKEMON_AI_MODEL=gpt-5.5
# Set to human to run the agent entrypoint with keyboard input as the actor.
# export POKEMON_AI_MODEL=human
```

`POKEMON_ROM_PATH` is required for real Pokemon screenshots. If
`POKEMON_SAVE_STATE_PATH` is omitted, the real backend boots from the ROM's
normal start. If set, it should point to a prepared Pallet Town field state so
rich state and collision checks start from a deterministic position.

## Run

Real backend:

```bash
cd backend
uv run uvicorn pokemon_harness.main:app --host 127.0.0.1 --port 8765
```

ROM-less fake backend for CLI and HTTP surface checks:

```bash
cd backend
uv run uvicorn pokemon_harness.fake_main:app --host 127.0.0.1 --port 8765
```

CLI:

```bash
cd cli
POKEMON_BACKEND_URL=http://127.0.0.1:8765 bun run human
```

Agent CLI:

```bash
cd cli
POKEMON_BACKEND_URL=http://127.0.0.1:8765 bun run agent
```

Human-as-model CLI:

```bash
cd cli
POKEMON_AI_MODEL=human POKEMON_BACKEND_URL=http://127.0.0.1:8765 bun run agent
```

Controls:

- `w/a/s/d`: movement
- `j`: A
- `J`: dialog-aware text skip
- `k`: B
- `Enter`: Start
- `Backspace`: Select
- `m`: menu
- `q`: quit

## API

- `GET /health`
- `POST /control/heartbeat`
- `POST /control/release`
- `GET /state`
- `GET /screenshot`
- `GET /screenshot?format=base64`
- `POST /action`
- `GET /saves`
- `POST /save`
- `POST /load`
- `POST /reset`
- `GET /ws?role=controller|observer`

Agent-facing tools:

- `use_emulator`

The agent plane intentionally does not expose reset, load, save, ROM loading, or
save-state controls.

`use_emulator` accepts a `buttons` array. Valid buttons are `a`, `b`, `up`,
`down`, `left`, `right`, `start`, `select`, and `wait`; `wait` advances two
seconds of emulator frames.

`POST /action` accepts button sequences:

```json
{
  "controllerId": "manual-cli",
  "sequence": [
    { "type": "button", "button": "up" },
    { "type": "wait", "frames": 60 }
  ]
}
```

## Verification

Run all always-on checks:

```bash
./scripts/check.sh
```

Manual HTTP smoke against a running backend:

```bash
curl -i http://127.0.0.1:8765/health
curl -i http://127.0.0.1:8765/state
curl -i -X POST http://127.0.0.1:8765/action \
  -H 'Content-Type: application/json' \
  -d '{"controllerId":"manual-cli","sequence":[{"type":"button","button":"up"},{"type":"wait","frames":60}]}'
```

Real-ROM preflight:

```bash
cd backend
uv run python -m pokemon_harness.preflight
```

## Troubleshooting

- Missing ROM: set `POKEMON_ROM_PATH` to an existing Red/Blue ROM outside the repo.
- Fake screen instead of Pokemon: run `pokemon_harness.main:app`, not `pokemon_harness.fake_main:app`.
- Missing save-state: optional; set `POKEMON_SAVE_STATE_PATH` only when you want to start from a prepared Pallet Town state.
- Port conflict: stop the existing process on `127.0.0.1:8765` or run uvicorn with another port and set `POKEMON_BACKEND_URL`.
- Terminal image failure: the CLI falls back to screenshot metadata and still renders state panels.
- Controller conflict: one live controller lease can send actions at a time. Stop the active CLI or wait a few seconds for a dead process lease to expire.
