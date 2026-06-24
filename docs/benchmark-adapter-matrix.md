# Benchmark Adapter Matrix

This matrix records benchmark readiness and confounds. It does not report
performance numbers. Every runnable benchmark still needs trace evidence,
objective results, run metadata, and DoneClaim packets.

| game | backend | objective | privilegeLevel | controllerMode | selfImprovement | status | proofCommand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| red-blue | pyboy_fake | redblue.pallet_fake_smoke | ram_lite | llm_macro_deterministic_micro | none | supported | `bun test trace-viewer.test.ts trace-corpus.test.ts && bun run trace-corpus -- validate --input test-fixtures/traces/fake-run` |
| red-blue | pyboy_real | redblue.first_gym | ram_lite | llm_macro_deterministic_micro | none | supported-no-performance-claim | `cd backend && uv run python -m pokemon_harness.preflight` |
| red-blue | mgba_http | redblue.viridian_arrival | ram_full | llm_macro_deterministic_micro | none | adapter-only | `test -s .omo/evidence/task-23-mgba-conformance.md && rg -n 'HarnessEmulator|mGBA-http|proofCommand' .omo/evidence/task-23-mgba-conformance.md` |
| emerald | pokeagent | emerald.track2.milestones | pixels_text | llm_buttons | proposal_only | adapter-only | `test -s .omo/evidence/task-24-pokeagent-adapter.md && rg -n 'HTTP|MCP|frames|ASCII map|button inputs|no-copy' .omo/evidence/task-24-pokeagent-adapter.md` |
| red-blue | pyboy_real | redblue.first_gym | external_guidebook | llm_buttons | qa_gated | out-of-scope-for-abi-v1 | `rg -n 'Do not mix RAM-full|Do not auto-promote|Trace viewer reports' README.md .omo/plans/pokemon-harness-master-plan.md` |

## Status Rules

- `supported` means the current repo has a no-ROM or local verification path.
- `supported-no-performance-claim` means the objective and run metadata shape
  exist, but a real run is required before reporting completion or efficiency.
- `adapter-only` means a conformance map exists but no runtime dependency or
  benchmark claim has been added.
- `out-of-scope-for-abi-v1` means the combination would mix privilege,
  controller determinism, or self-improvement axes beyond the current ABI v1
  benchmark boundary.
