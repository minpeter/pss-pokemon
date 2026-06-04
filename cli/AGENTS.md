# CLI KNOWLEDGE BASE

Scope: `cli/`

## OVERVIEW

Bun ESM TypeScript package with one shared control path behind two terminal
entrypoints: `bun run human` for keyboard control and `bun run agent` for a PSS
runtime agent loop. `POKEMON_AI_MODEL=human bun run agent` uses keyboard input
as the actor on the agent entrypoint. Backend responses are parsed through Zod
before they reach runtime code.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Human CLI | `src/main.ts`, `src/human-control-plane.ts` | Keyboard actor, menu, shared observation/action path. |
| Human keymap/env | `src/keymap.ts`, `src/human-env.ts` | `manual-cli` and backend URL defaults. |
| Agent CLI | `src/agent-main.ts` | Env, terminal view, file-backed memory, top-level errors. |
| Agent env | `src/agent-env.ts`, `src/env-files.ts` | Loads root `.env`, `backend/.env`, then `cli/.env`; later files win. |
| Agent runtime | `src/agent-runtime.ts` | Thin adapter around `runPokemonControlLoop()` and `createPssRuntimeActor()`. |
| PSS actor | `src/pss-runtime-actor.ts` | Instructions, provider/session, fresh observation hook, dashboard forwarding. |
| Agent tools | `src/agent-tools.ts` | Action-only AI tools and verification summaries. |
| Agent memory | `src/agent-memory*.ts` | Recent actions, stuck movement warnings, projection schema, file store. |
| Control loop | `src/pokemon-control-loop.ts` | Controller heartbeat/release, observation, actor turn, post-action observation. |
| Action executor | `src/pokemon-action-executor.ts` | Shared backend action execution and verification summary. |
| API client | `src/api-client.ts`, `src/transport.ts` | Zod-parsed backend wrapper and HTTP error normalization. |
| API schema mirror | `src/schemas.ts` | Keep synchronized with backend Pydantic JSON aliases. |
| Renderer/view | `src/renderer.ts`, `terminal-image-renderer.ts`, `agent-terminal-view.ts` | Terminal frame, image fallback, spinner/status handling. |
| Fixtures | `src/agent-test-fixtures.ts` | Reusable observation and recording transport fixtures. |

## CONVENTIONS

- Run CLI commands from `cli/`; this is a Bun package, not npm/pnpm/yarn.
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

## RUNTIME CONTRACTS

- Human controls: `w/a/s/d` movement, `j` A, uppercase `J` dialog skip, `k` B,
  Enter Start, Backspace Select, `m` menu, `q` quit.
- Human controller ID is `manual-cli`; agent controller ID defaults to
  `agent-cli`, except `POKEMON_AI_MODEL=human` defaults to `manual-cli`.
- `POKEMON_BACKEND_URL` defaults to `http://127.0.0.1:8765`.
- Agent env supports `POKEMON_AI_BASE_URL`, `POKEMON_AI_API_KEY`,
  `POKEMON_AI_MODEL`, `POKEMON_AGENT_CONTROLLER_ID`,
  `POKEMON_AGENT_SESSION_ID`, plus `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`
  fallbacks. Defaults include AI base `https://codex.nekos.me/v1`, model
  `gpt-5.5`, and session `pokemon-agent`.
- Agent memory persists under `.local/agent-memory/<sanitized-session-id>/` as
  `projection.json` plus `episodes.jsonl`; do not commit it.
- Agent tool control is action-only through `use_emulator({ buttons })`.
  Valid buttons are `a`, `b`, `up`, `down`, `left`, `right`, `start`,
  `select`, and `wait`; `wait` advances two seconds of emulator frames.
- Do not expose reset, load, save, ROM loading, or save-state controls to the
  agent plane.
- Agent runtime should keep looping until interrupted. `maxTurns` is for tests
  and injected callers, not a CLI completion condition.
- Each PSS turn must steer fresh observation text plus current screenshot and
  grid/collision screenshot before sending the turn prompt.

## GOTCHAS

- `KyJsonTransport` normalizes leading slashes, uses a 5000 ms timeout, disables
  retries, and turns backend `detail` JSON into `BackendHttpError`.
- `runPokemonControlLoop()` claims `/control/heartbeat`, refreshes it while the
  CLI is alive, and posts `/control/release` on graceful exit.
- `gridScreenshot()` fetches PNG bytes from `/screenshot/grid?scale=4` and wraps
  them as base64 because model input expects screenshot-shaped data.
- Memory context is advisory: repeated failed moves can emit `STUCK_WARNING`,
  but live observation and action verification remain the source of truth.
