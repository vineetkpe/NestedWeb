# Single Scan Orchestration Implementation Plan

**Goal:** Complete only the Level 2 in-process scan boundary under ADR-012.

**Architecture:** `src/domain/scan.ts` owns request/result/attempt/failure types; `src/application/scan.ts` performs sequential execution; `scan-validation.ts` validates bounded input, provenance and returned observations. Reuse the profile validator extracted from `prompt-generation.ts` and the prompt identity function from `prompt-library.ts`. Keep the existing provider interface, widening descriptive provider labels only. No new dependencies or infrastructure.

**Spec:** User's Single Scan Orchestration Boundary attachment, ADR-012, and existing profile/prompt/provider/report contracts.

## One implementation task

- [x] Write `src/application/scan.test.ts` using real profile/prompt fixtures and a deterministic fake provider. Cover 8–10 and sparse cohorts, rejected empty/large/duplicate/malformed input, exact ordering and IDs, all response outcomes, failures without lost successes, each cancellation timing, no retries, mutation protection, malicious text, invalid/oversized/mismatched provider data, and provider independence.
- [x] Run against an explicit unavailable stub and observe behavioral failures.
- [x] Implement shared validation reuse, explicit types and bounded sequential execution. Validate all inputs before side effects; retain one ordered entry per prompt and no observation for unexecuted queries.
- [x] Run focused tests and strict types, correcting defects with observed regressions.
- [x] Update architecture/security/testing/current scan/report boundaries; review the actual diff independently.
- [x] Run `npm.cmd run verify`, `npm.cmd run test:db`, `npm.cmd audit`, and `git diff --check`. Record results and stop without committing.

## Verification record

The initial unavailable stub produced 13 expected behavior failures; two generic negative-validation tests already passed. The implemented suite then passed 15 tests. Regressions for unsupported observation-ID characters, hidden accessors and sparse evidence arrays were observed failing before correction. Citation-ownership coverage brings the focused suite to 19 passing tests. Strict types passed after correcting a readonly assignment in a mutation test.

Independent read-only review found no critical or important code findings and passed all 19 focused tests. Its minor ADR encoding finding was corrected. Final verification on 2026-09-10:

- `npm.cmd run verify`: exit 0. Formatting, lint, generated route types, strict TypeScript, production build, 410 unit tests and 10 desktop/mobile Chromium browser tests passed. Browser tests include keyboard, reflow and automated accessibility. The browser runner emitted non-failing warnings that `NO_COLOR` is ignored because `FORCE_COLOR` is set.
- `npm.cmd run test:db`: exit 1 before SQL execution; `ECONNREFUSED 127.0.0.1:54322`. No SQL, migration, pgTAP or RLS verification is claimed.
- `npm.cmd audit`: exit 0, zero vulnerabilities.
- `git diff --check`: exit 0.

## Changed files and stop state

- Added `src/domain/scan.ts`, `src/application/scan.ts`, `src/application/scan-validation.ts`, and `src/application/scan.test.ts` for contracts, sequential execution, bounded validation and 19 focused tests.
- Extracted `src/application/company-profile-validation.ts` from `src/application/prompt-generation.ts` without changing profile-validation behavior. Shared query identity and template/category metadata in `src/domain/prompt-library.ts` without regenerating prompts inside the runner.
- Updated descriptive labels in `src/application/grounded-ai-provider.ts` and `src/domain/raw-observation.ts` so the runner and fake provider use the existing interface without Gemini-specific logic. No provider transport or live-execution behavior changed.
- Updated `ARCHITECTURE.md`, `SECURITY.md`, `TESTING.md`, `docs/report-specification.md`, and `docs/scanning-architecture.md`; added this plan/handoff.

The working tree remains uncommitted with nine modified and six new files. HEAD remains `43550e9` on `main`. No dependency, persistence, job/worker, authentication, live provider call, UI, metric or interpretation was added. The runner waits for provider settlement and relies on the provider's deadline contract; arbitrary injected code is trusted infrastructure, not proof of authorization. Database checks remain blocked. Stop at this task boundary.
