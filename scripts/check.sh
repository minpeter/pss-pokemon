#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

(
  cd backend
  uv run ruff check .
  uv run basedpyright
  uv run pytest
)

(
  bun install --frozen-lockfile
  bunx biome check .
  bunx tsc --noEmit
  bun test
)
