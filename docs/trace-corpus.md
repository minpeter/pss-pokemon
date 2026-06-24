# Trace Corpus Workflow

Trace corpora are shared inspection and regression assets, not ROM bundles and
not benchmark authority. Keep them under `.local/` or an explicit export
directory until validation passes.

## Collect

```bash
POKEMON_TRACE_ROOT=.local/runs POKEMON_TRACE_RUN_ID=<run-id> bun run human
```

For agent runs, use the same `POKEMON_TRACE_ROOT` and `POKEMON_TRACE_RUN_ID`
variables with `bun run agent`. The trace writer records `run.json`,
`events.jsonl`, `actions.jsonl`, `observations.jsonl`, and optional
`token-usage.jsonl`.

## Validate

```bash
bun run trace-corpus -- validate --input .local/runs/<run-id> --output .local/runs/<run-id>/validation.json
```

Validation rejects API keys, absolute ROM/save paths, `.gb`, `.gbc`, `.sav`,
`.state` references, forbidden artifact files, and oversized inline
`pngBase64` screenshots. Traces should store screenshot metadata, not screenshot
bodies. Use `--allow-local-only-screenshots` only for local evidence that will
not be shared.

## Compare

```bash
bun run trace-corpus -- compare --left .local/runs/new --right .local/runs/baseline --output .local/runs/trace-diff.json
bun run trace-viewer -- --input .local/runs/new --compare .local/runs/baseline
```

The diff is an inspection aid. Objective completion, privilege level,
controller mode, ROM identity, and DoneClaim evidence remain the benchmark
record.
