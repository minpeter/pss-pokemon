# Pokemon TS Harness V1

Pokemon Red/Blue harness with a headless PyBoy backend and a shared TypeScript
control plane for human keyboard play or pss-runtime agent play.

## Scope

V1 keeps observation, terminal rendering, action execution, and verification on
one shared path. The only swapped component is the actor: either a human pressing
keyboard keys, or `@minpeter/pss-runtime@0.0.10` selecting backend action tools.

This repository has a root Bun TypeScript package and a backend subcomponent.
Run Bun CLI/runtime commands from the repository root, backend commands from
`backend/`, and use `./scripts/check.sh` at the repo root for the full gate.

## Harness ABI

The portable ABI is Red/Blue first. Backend Pydantic models and CLI Zod schemas
mirror camelCase JSON fields such as `abiVersion`, `controllerId`,
`frameBefore`, `frameAfter`, `parserWarnings`, and `pngBase64`. Shared fixtures
under `test-fixtures/` cover observations, actions, events, replays, objective
results, and DoneClaim evidence examples.

`POST /action` is supervised before emulator execution. The deterministic input
supervisor normalizes simple walk/dialog actions, bounds frame counts, rejects
unsafe holds, preserves controller conflicts, and returns a fresh post-action
observation.

## Evaluation And Evidence

Trace mode is opt-in. Set `POKEMON_TRACE_ROOT` and optionally
`POKEMON_TRACE_RUN_ID` to record `run.json`, `events.jsonl`, `actions.jsonl`,
`observations.jsonl`, and optional token usage for a run.

```bash
POKEMON_BACKEND_MODE=fake POKEMON_TRACE_ROOT=.local/runs POKEMON_TRACE_RUN_ID=fake-smoke bun run human
```

Local inspection tools:

```bash
bun run eval-metrics -- --trace .local/runs/<run-id> --output .local/runs/<run-id>/metrics.json
bun run trace-viewer -- --input .local/runs/<run-id>
bun run trace-corpus -- validate --input .local/runs/<run-id>
```

The objective registry separates functional checks from benchmark milestones,
including Pallet fake smoke, starter acquisition, Viridian arrival, Oak's
Parcel, and first gym placeholders. The privilege ladder records observation
privilege, controller determinism, model id, temperature, ROM identity, backend
kind, and objective id so results are not compared across mixed permissions.

Trace viewer reports and corpus diffs are inspection UX only. Benchmark
authority stays with objective results, run metadata, metrics, and local
DoneClaim evidence.

## Legal ROM Boundary

Provide your own legally obtained Pokemon Red/Blue ROM. Do not commit ROMs,
save files, or save-states. This repo gitignores common ROM and save-state
extensions plus `.local/`. Trace corpora must not include ROM paths, API keys,
save-state paths, or inline real-ROM screenshots intended for sharing.

## Setup

```bash
cp .env.example .env
cd backend && uv run pytest
cd .. && bun install && bun test
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
# Optional trace recording:
# export POKEMON_TRACE_ROOT=.local/runs
# export POKEMON_TRACE_RUN_ID=manual-smoke
```

`POKEMON_ROM_PATH` is required for real Pokemon screenshots. If
`POKEMON_SAVE_STATE_PATH` is omitted, the real backend warms up past the black
boot frame and starts at the title screen (the first observation renders rather
than showing an empty frame). If set, it should point to a prepared field state
so rich state and collision checks start from a deterministic in-game position.

To produce such a save state — boots the ROM, drives through the intro
(including the Korean/Japanese name-entry screen), and writes a save state once
the player has overworld control:

```bash
cd backend && uv run python -m pokemon_harness.make_intro_save_state \
  --rom "$POKEMON_ROM_PATH" --out .local/savestates/intro-done.state
```

Save states are ROM-derived and gitignored; do not commit them.

## Run

The CLI manages backend sessions by default. A normal `human` or `agent` launch
starts a new detached backend process, prints the session id and URL, then
connects the control loop to that backend. Ctrl+C exits the CLI and releases the
controller lease; it does not stop the backend session. Stop backends explicitly
with `bun run sessions -- stop <session-id>`.

Human CLI:

```bash
bun run human
```

Agent CLI:

```bash
bun run agent
```

Human-as-model CLI:

```bash
POKEMON_AI_MODEL=human bun run agent
```

The agent loop is designed to keep running until interrupted. There is no
user-facing max-turn, budget, completion, or `--loop` toggle.

Start a fresh backend even when `POKEMON_BACKEND_URL` is present:

```bash
bun run human -- --new
```

Resume an existing live backend session:

```bash
bun run human -- --resume
```

Session management:

```bash
bun run sessions -- list
bun run sessions -- stop <session-id>
bun run sessions -- prune
```

ROM-less fake backend mode for CLI and HTTP surface checks:

```bash
POKEMON_BACKEND_MODE=fake bun run human
```

ROM-less fake backend mode for direct HTTP checks:

```bash
cd backend
uv run uvicorn pokemon_harness.fake_main:app --host 127.0.0.1 --port 8765
```

Advanced external backend mode:

```bash
cd backend
uv run uvicorn pokemon_harness.main:app --host 127.0.0.1 --port 8765
cd ..
POKEMON_BACKEND_URL=http://127.0.0.1:8765 bun run human
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

The action-only agent plane intentionally does not expose reset, load, save, ROM
loading, or save-state controls.

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

Manual HTTP smoke against a running fake backend:

```bash
cd backend
uv run uvicorn pokemon_harness.fake_main:app --host 127.0.0.1 --port 8765
curl -i http://127.0.0.1:8765/health
curl -i http://127.0.0.1:8765/state
curl -i http://127.0.0.1:8765/screenshot
curl -i 'http://127.0.0.1:8765/screenshot?format=base64'
curl -i 'http://127.0.0.1:8765/screenshot/grid?scale=4'
curl -i http://127.0.0.1:8765/map/ascii
curl -i -X POST http://127.0.0.1:8765/action \
  -H 'Content-Type: application/json' \
  -d '{"controllerId":"manual-cli","sequence":[{"type":"button","button":"up"},{"type":"wait","frames":60}]}'
```

Real-ROM preflight:

```bash
cd backend
uv run python -m pokemon_harness.preflight
```

## Adapter Roadmap

Red/Blue PyBoy remains the portable core. mGBA, Emerald, PokéAgent, and
Continual Harness compatibility are adapter and benchmark targets, not first-wave
runtime dependencies. Any adapter must map into the same observation/action/event
trace ABI and record privilege level, controller mode, ROM identity, backend
kind, and objective id before making comparison claims.

## Guardrails

- Do not make a stronger system prompt, a larger model, or longer context the
  main deliverable.
- Do not expose reset, load, save, ROM, save-state, or benchmark privilege
  controls to the agent tool plane.
- Do not let agent memory bypass fresh observation or action verification.
- Do not mix RAM-full, guidebook, deterministic controller, generated policy, or
  self-improvement results without recording those axes in run metadata.
- Do not auto-promote self-improvement candidates into prompts, skills, memory,
  code, or runtime config.
- Do not commit `.omo/`, `.local/`, ROMs, saves, save-states, or trace exports
  that fail corpus validation.

## Troubleshooting

- Missing ROM: set `POKEMON_ROM_PATH` to an existing Red/Blue ROM outside the repo.
- Fake screen instead of Pokemon: unset `POKEMON_BACKEND_MODE=fake` for managed CLI sessions, or run `pokemon_harness.main:app` instead of `pokemon_harness.fake_main:app` for external backend mode.
- Missing save-state: optional; set `POKEMON_SAVE_STATE_PATH` only when you want to start from a prepared Pallet Town state.
- Port conflict: managed CLI sessions allocate fresh local ports automatically. For external backend mode, stop the existing process on `127.0.0.1:8765` or run uvicorn with another port and set `POKEMON_BACKEND_URL`.
- Lingering backend sessions: run `bun run sessions -- list`, then `bun run sessions -- stop <session-id>` or `bun run sessions -- prune`.
- Terminal image failure: the CLI falls back to screenshot metadata and still renders state panels.
- Controller conflict: one live controller lease can send actions at a time. Stop the active CLI or wait a few seconds for a dead process lease to expire.
- Trace corpus rejected: run `bun run trace-corpus -- validate --input <run-dir>` and remove API keys, absolute ROM/save paths, forbidden artifact references, or oversized inline screenshot bodies.
