# Niche Prompt Library Implementation Plan

**Goal:** Implement only the user's deterministic CompanyProfile-to-query slice, Level 2 preparation under ADR-010.

**Architecture:** Pure types/templates in `src/domain/prompt-library.ts`; runtime CompanyProfile validation and entry point in `src/application/prompt-generation.ts`. Preserve the existing extractor and crawler contracts. No dependencies, provider calls, persistence, or UI.

**Spec:** User's attached Niche Prompt Library / Query Generation request; category contract in `docs/report-specification.md` and bounded decisions in ADR-010.

**Acceptance and stop condition:** Six evidence-gated categories, stable IDs/order/version, English/unspecified-locale metadata, no invented inputs, bounded deduplicated cohort, resolvable references, all requested edge cases covered; run the four requested checks and report any blocked database execution. Do not commit or start another task.

## One implementation task

- [x] Add `src/application/prompt-generation.test.ts` using real extractor-produced, explicitly test-only profiles. Assert complete/sparse cohorts, each missing prerequisite, conflicts, duplicate/multiple use cases, qualified geography, inert instructions, ordering/IDs, all categories, source resolution, malformed input, and bounds.
- Historical verification limit: the planned pre-implementation failing test run was not recorded before interruption. The resumed session retained the existing implementation and tests; it does not claim an observed red-first run.
- [x] Add domain types and fixed templates plus `generatePrompts(input: unknown): PromptGenerationResult` at the application boundary. Validate version, field states/cardinality, bounded values/evidence, evidence spans and page references. Return `invalid_profile` for malformed input without raw diagnostics. Generate at most ten planned queries with three use cases and two service areas, omitting oversized query terms.
- [x] Run the focused tests and strict types; correct implementation against observed failures.
- [x] Update architecture/testing/security documentation and the report's planned-query boundary, keeping unrelated content intact.
- [x] Review the actual diff with the requesting-code-review skill and run `npm run verify`, `npm run test:db`, `npm audit`, and `git diff --check`. Record results below and stop without committing.

## Verification record

Resumed and verified on 2026-09-10. Existing uncommitted implementation and tests were preserved. Independent read-only review found no critical or important defects; corrected the security documentation to describe the effective 2,048-code-unit URL limit imposed by the shared normalizer.

- `node --test src/application/prompt-generation.test.ts`: reviewer ran it; 18/18 passed. All 18 also passed in the full unit suite below.
- `npm.cmd run verify`: exit 0. Formatting, lint, generated route types, strict TypeScript, production build, 363 unit tests, and 10 desktop/mobile Chromium browser tests passed. Browser tests include keyboard, reflow, and automated accessibility checks. Only non-failing `NO_COLOR`/`FORCE_COLOR` warnings were emitted by the browser runner.
- `npm.cmd run test:db`: exit 1 before SQL execution. Local PostgreSQL at `127.0.0.1:54322` refused the connection. No pgTAP, migration, or RLS verification is claimed; the existing database draft remains unverified.
- `npm.cmd audit`: exit 0, zero vulnerabilities.
- `git diff --check`: exit 0.

Changed files: the application generator/test, domain prompt library, this plan, `ARCHITECTURE.md`, `SECURITY.md`, `TESTING.md`, and `docs/report-specification.md`. The production build regenerated `next-env.d.ts` to its tracked production paths, leaving no final diff in that generated file. Working tree remains uncommitted with four modified documentation files and four new files. No next task was started.
