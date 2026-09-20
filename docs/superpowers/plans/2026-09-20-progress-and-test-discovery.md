# Progress reconciliation and test discovery implementation plan

**Goal:** Include omitted server-boundary tests in verification and publish an evidence-based V1 progress checklist.

**Architecture:** Retain the existing Node test runner and application boundaries. Correct current-status summaries without rewriting historical decisions.

**Tech stack:** Node 24, npm, Markdown; no dependencies added.

**Spec:** [Product scope](../../product-scope.md), Levels 0–6 and the task Definition of Done.

## Scope and acceptance

Level 1 verification maintenance plus cross-level status documentation. Existing nested Supabase server tests must run through `test:unit` and therefore `verify`. Status must distinguish implemented code from customer workflows and verified deployment. No UI, database, provider, or remote runtime changes. Stop after this fix, documentation, applicable checks, and the user-authorized commit/push.

## Steps

- [x] Inspect clean checkout at `7190ab0`, route callers, scan composition, existing test command and CI.
- [x] Reproduce omission by comparing Node `globSync` results for the package test patterns against `src/**/*.test.ts`: three server test files are missing.
- [x] Add the existing nested server-test directory to `package.json` test discovery; preserve all current tests.
- [x] Update README, agent/current architecture and product summaries; add a progress checklist with explicit counting rules and remaining work. Update testing documentation for actual CI/database scope.
- [x] Verify test discovery, run `npm run verify`, `npm audit`, and attempt `npm run test:db`; report environmental blockers as unverified.
- [x] Review the diff and prepare only this portion for the user-authorized commit/push. Do not touch the parent checkout's unfinished changes.

The newly selected tests also required changing the existing `next/headers` import to `next/headers.js` for native Node ESM. Existing tests reproduced the load failure and then all nine passed. See [verification results](../../project-progress.md#portion-1-verification-and-status-repair) for outcomes and database limitations.
