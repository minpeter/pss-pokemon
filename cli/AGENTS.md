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
| Human keymap | `src/keymap.ts` | Injectable controller ID and mapped keys. |
| Agent CLI | `src/agent-main.ts` | Env, terminal view, and top-level error handling. |
| Agent env | `src/agent-env.ts` | Loads root `.env`, `backend/.env`, then `cli/.env`; later files win. |
| Agent runtime | `src/agent-runtime.ts` | PSS runtime loop, observation injection, dashboard forwarding. |
| Agent tools | `src/agent-tools.ts` | Action-only AI tools and verification summaries. |
| Control loop | `src/pokemon-control-loop.ts` | Shared controller heartbeat/release, observation, actor turn, and post-action observation loop. |
| Action executor | `src/pokemon-action-executor.ts` | Shared backend action execution and post-action observation. |
| API client | `src/api-client.ts` | Zod-parsed backend wrapper. |
| Transport | `src/transport.ts` | Ky HTTP transport and parsed backend error details. |
| API schema mirror | `src/schemas.ts` | Keep synchronized with backend Pydantic JSON aliases. |
| Renderer | `src/renderer.ts`, `terminal-image-renderer.ts` | Terminal frame, image fallback, scrollback behavior. |
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
  Switching surfaces on one backend can hit controller conflict only while the
  previous controller lease is still live.
- `POKEMON_BACKEND_URL` defaults to `http://127.0.0.1:8765`.
- Agent env supports `POKEMON_AI_BASE_URL`, `POKEMON_AI_API_KEY`,
  `POKEMON_AI_MODEL`, `POKEMON_AGENT_CONTROLLER_ID`,
  `POKEMON_AGENT_SESSION_ID`, plus `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`
  fallbacks. Defaults include AI base `https://codex.nekos.me/v1`, model
  `gpt-5.5`, and session `pokemon-agent`.
- Agent tools are action-only: `pokemon_press`, `pokemon_walk`, `pokemon_hold`,
  `pokemon_wait`, and `pokemon_text_skip`.
- Do not expose reset, load, save, ROM loading, or save-state controls to the
  agent plane.
- Agent runtime should keep looping until interrupted. `maxTurns` is for tests
  and injected callers, not a CLI completion condition.
- Agent observation input is multipart: compact state text, current screenshot,
  and grid/collision overlay screenshot.

## COMMANDS

```bash
bun install --frozen-lockfile
bunx biome check .
bunx tsc --noEmit
bun test
POKEMON_BACKEND_URL=http://127.0.0.1:8765 bun run human
POKEMON_BACKEND_URL=http://127.0.0.1:8765 bun run agent
POKEMON_AI_MODEL=human POKEMON_BACKEND_URL=http://127.0.0.1:8765 bun run agent
```

## GOTCHAS

- `KyJsonTransport` normalizes leading slashes, uses a 5000 ms timeout, disables
  retries, and turns backend `detail` JSON into `BackendHttpError`.
- `runPokemonControlLoop()` claims `/control/heartbeat`, refreshes it while the
  CLI is alive, and posts `/control/release` on graceful exit.
- `gridScreenshot()` fetches PNG bytes from `/screenshot/grid?scale=4` and wraps
  them as base64 because the model/input renderer expects screenshot-shaped data.
- Terminal image code has native graphics, ANSI fallback, row reservation, and
  current-screenshot-plus-grid model image behavior covered by tests.
