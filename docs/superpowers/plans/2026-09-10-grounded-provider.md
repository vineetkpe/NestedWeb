# Grounded Provider Boundary Implementation Plan

**Goal:** Complete only the Level 2 single-query provider boundary under ADR-011.

**Architecture:** `src/domain/raw-observation.ts` owns observation/citation records; `src/application/grounded-ai-provider.ts` owns request validation and the provider contract. `src/infrastructure/gemini.ts` owns server-only transport/credentials/capture, and `gemini-response.ts` owns schema normalization. Extract the existing crawler body reader to `provider-response-body.ts` for reuse. No new dependencies.

**Spec:** User's Grounded AI Provider Boundary attachment; `docs/report-specification.md` and ADR-011. Preserve exact queries and response provenance, accept citations only from structured grounding metadata, and keep live execution unavailable.

## One implementation task

- [x] Add focused tests in `src/infrastructure/gemini.test.ts` for success, actual metadata citations, absence/duplicates/invalid URLs, refusal/partial/failure, missing model, exact query/body/digest, cancellation/deadline, bounds, credentials, inert instructions, and closed live execution. Use synthetic provider fixtures and a captured execution-clock value, never fabricated real observation dates.
- [x] Run the focused suite against an explicit unavailable stub and observe failing behavior assertions.
- [x] Implement explicit types, unknown request validation, bounded transport capture, and schema normalization. Keep failure codes separate from raw content. Snapshot validated request fields before awaiting transport.
- [x] Run focused tests and strict types; add regressions for observed defects before fixes.
- [x] Update security/testing/report documentation and review the actual diff with the requesting-code-review skill.
- [x] Run `npm.cmd run verify`, `npm.cmd run test:db`, `npm.cmd audit`, and `git diff --check`; record exact results and stop without committing.

## Verification record

The initial stub run failed 23 behavior tests as expected (two negative/setup-import checks already passed). The implemented suite passed 25 tests and strict types. A subsequent malformed refusal-field regression failed before the explicit string check, then passed after correction. Additional UTF-8/BOM and invalid-clock cases bring the final focused suite to 28 passing tests. All 51 existing Firecrawl tests passed after extracting its body reader. Independent read-only review found no unresolved blocking findings.

Final verification on 2026-09-10:

- `npm.cmd run verify`: exit 0 after the final code/test changes. Formatting, lint, generated route types, strict TypeScript, production build, 391 unit tests, and 10 desktop/mobile Chromium browser tests passed. Browser checks include keyboard/reflow and automated accessibility. Non-failing browser-runner warnings report `NO_COLOR` being ignored because `FORCE_COLOR` is set.
- `npm.cmd run test:db`: exit 1 before SQL execution, `ECONNREFUSED 127.0.0.1:54322`. No migration, pgTAP, or RLS verification passed.
- `npm.cmd audit`: exit 0, zero vulnerabilities.
- `git diff --check`: exit 0.

## Changed files and stop state

- Added `src/domain/raw-observation.ts` and `src/application/grounded-ai-provider.ts` for explicit records, query validation, and the provider contract.
- Added `src/infrastructure/gemini.ts`, `gemini-response.ts`, and `gemini.test.ts` for server-only capture, structured normalization, and 28 focused tests.
- Added `src/infrastructure/provider-response-body.ts` and updated `src/infrastructure/firecrawl.ts` to reuse the existing bounded reader without changing Firecrawl behavior.
- Updated `ARCHITECTURE.md`, `SECURITY.md`, `TESTING.md`, and `docs/report-specification.md`; added this plan/handoff.

Working tree is not clean: five modified files and seven new files, all uncommitted. HEAD remains `85036f4` on `main`. No dependencies, live provider calls, scanner, jobs, persistence, UI, interpretation, or subsequent task were added. Mocked capture is not a live provider result; database verification remains blocked.
