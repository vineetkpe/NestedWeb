# Core tenancy implementation plan

**Goal:** Prepare and, when an authenticated database connection is available, apply the four-table Level 1 foundation with tested tenant isolation.

**Architecture:** One imperative Supabase migration, one pgTAP suite, and the official CLI configuration. The app remains static. ADR-006 records the access matrix and the unavailable execution prerequisites.

**Spec:** User's core-table implementation request, ARCHITECTURE.md ADR-006, SECURITY.md, and docs/database-foundation.md.

## Bounded task

- [x] Inspect repository state, existing contracts, and available MCP tools; preserve unrelated changes.
- [x] Pin the official CLI and generate `supabase/migrations/20260908032249_core_tenancy.sql` and `supabase/tests/core_tenancy_test.sql` through its commands.
- [x] Write pgTAP tests for profile ownership, atomic workspace bootstrap, same/cross-tenant project CRUD, anonymous/nonmember/revoked access, immutable tenant fields, and denied membership escalation. Assertions are drafted, not verified as passing.
- [ ] Obtain a failing assertion before implementation. The resumed session inherited the implementation; its test attempt failed before SQL execution because the local database is unavailable. No red/green result is claimed.
- [x] Draft four tables, constraints, least grants, RLS, timestamp maintenance, and the narrow atomic bootstrap function. Runtime verification remains open.
- [x] Review the SQL and test diff with the code-review skill. Add missing second-insert rollback, editable-metadata denial, profile cross-user update, and function privilege assertions; correct stale implementation/testing documentation. Database execution remains a release blocker.
- [x] Run `npm run verify`, `npm audit`, `git diff --check`, and attempt `supabase test db --local`. Application checks passed, audit found zero vulnerabilities, diff whitespace check passed; database connection failed before assertions.
- [ ] With authenticated MCP access, inspect hosted schema and migration history before applying; verify catalog state and genuine role-based allow/deny tests on an isolated database before hosted rollout.

Stop after this task. An unavailable MCP/runtime leaves migration application and RLS verification blocked, never passed. No resets against hosted databases, secrets in artifacts, commits, or later product features.

## Resumption record — 2026-09-08

The local CLI reports `2.117.0`. `supabase test db --local` exits 1 with `ECONNREFUSED 127.0.0.1:54322` before executing any assertions. Docker and `psql` are unavailable on PATH; the standard Docker Desktop executable is absent. This session has no callable Supabase tools or configured database environment variables. A running disposable local Supabase database is required for migration replay, pgTAP, lint/advisors, and type generation; authenticated project access and environment/schema/history inspection are additionally required before any hosted rollout.

`npm run verify` exited 0: formatting, lint, strict types, production build, and all ten desktop/mobile Chromium tests passed. These include keyboard and automated accessibility checks of the unchanged static app. `npm audit` exited 0 with zero vulnerabilities. `git diff --check` passed. `npm run test:db` exited 1 with the connection failure above; no SQL test passed or failed an assertion. The only application-runner warnings concerned `NO_COLOR`/`FORCE_COLOR`. No UI changes or new manual browser inspection occurred. No migration was applied and no commit was created.
