# Firecrawl crawler boundary plan

**Goal:** Implement only the reusable crawler contract and mocked Firecrawl adapter foundation authorized by the user.

**Architecture:** Application `Crawler`/`CrawlResult` types consume in-process validated website targets. Infrastructure owns credential handling, fixed Firecrawl v2 request construction, bounded response reading, parsing, and safe failures. Default live exchange remains unavailable because Firecrawl does not expose destination IP pinning; no existing SSRF policy is relaxed.

**Spec:** User's adapter-only requirements, ARCHITECTURE.md ADR-008, SECURITY.md, TESTING.md, existing website-target code, and official Firecrawl v2 scrape docs.

## Files and acceptance

- `src/application/crawler.ts`: small one-entry-page contract with normalized page fields and discriminated errors.
- `src/application/website-target.ts` and its tests: private brand, identity registration, and freezing enforce that only actual screening results enter the adapter.
- `src/infrastructure/firecrawl.ts`: server-only factory with lazy `FIRECRAWL_API_KEY` validation and injected exchange; fixed endpoint, bounded request/response/cancellation, and unavailable default live execution.
- `src/infrastructure/firecrawl-response.ts`: allowlisted provider response validation; genuine optional values, empty result handling, safe URL scope, no arbitrary metadata passthrough.
- `src/infrastructure/firecrawl.test.ts`: fixture-backed request/result/error, response-size, deadline, credential, provenance, and import-guard tests. No real key, DNS, or HTTP.
- `.env.example`: blank server-only credential placeholder. `package.json`/lockfile: server-only dependency and server test condition. Security/testing/architecture docs describe scope and remaining live prerequisites.

## Execution

- [x] Inspect repository/code/contracts and provider docs; repository starts clean at `172ee86`.
- [x] Record the scope and SSRF integration decision before implementation.
- [x] Add failing provenance and adapter tests, then implement the minimal boundary. The mutation-protection assertion failed on the existing mutable target and passed after freezing; initial adapter tests failed because the module did not yet exist.
- [x] Review actual diff and security surfaces; run `npm run verify`, `npm run test:db`, `npm audit`, `git diff --check`.
- [x] Record results and first-live-crawl prerequisites; stop without committing.

No default live call, Supabase integration, company extraction, scanning pipeline, or UI is part of this task. Native Firecrawl response examples are test fixtures only and never displayed as customer observations.

## Verification and handoff — 2026-09-08

- `npm run verify`: exit 0; formatting, lint, strict types, production build, all 279 unit/security tests and all 10 desktop/mobile browser tests passed. This adds 52 tests to the previous 227 (51 Firecrawl cases plus one target immutability case).
- `npm run test:db`: exit 1 before SQL execution, `ECONNREFUSED 127.0.0.1:54322`; no database assertions ran. Supabase remains unavailable and no database file changed.
- `npm audit`: exit 0, zero vulnerabilities. The lockfile adds only `server-only@0.0.1`; its package contains no install script.
- `git diff --check`: exit 0. Reviewed tracked changes and new source/tests. No diff in `src/domain`, `src/app`, `supabase`, or `.vscode/mcp.json`.
- Client bundle check found neither `FIRECRAWL_API_KEY` nor the test-only credential marker under `.next/static`. The separate default-condition import test rejects the server-only module. No real key or provider/network call was used.
- Browser tests retain the existing `NO_COLOR`/`FORCE_COLOR` warnings. No UI changed, so no new manual UI inspection was performed. No commit created.

Before a first real crawl: provision the credential privately; implement and review a transport/deployment that preserves destination pinning and DNS freshness for redirects/subresources; provide server-side authorization and atomic usage/cost reservation in a separate orchestrator; confirm provider limits and retention/cache semantics; then run a deliberately bounded authorized integration test against the actual API. The current adapter exposes only one entry page, not a multi-page crawl job. Firecrawl may serve cached data under its defaults; no collection timestamp or freshness claim is fabricated. Cancellation does not establish that remote work stopped being billable.

Files added: `.env.example`, `src/application/crawler.ts`, `src/infrastructure/firecrawl.ts`, `src/infrastructure/firecrawl-response.ts`, `src/infrastructure/firecrawl.test.ts`, and this plan. Files modified: `src/application/website-target.ts`, `src/application/website-target.test.ts`, `package.json`, `package-lock.json`, `ARCHITECTURE.md`, `SECURITY.md`, and `TESTING.md`.

## Resumption verification — 2026-09-09

Reviewed the existing implementation, callers, tests, and actual diff against this task's acceptance boundary. No source changes were needed; the adapter foundation is complete within its mocked-only scope.

- `npm run verify`: exit 0; formatting, lint, strict types, production build, 279 unit/security tests, and 10 desktop/mobile browser tests passed.
- `npm audit`: exit 0, zero vulnerabilities.
- `npm run test:db`: exit 1 before SQL execution; connection refused at `127.0.0.1:54322`. Docker is unavailable on PATH. Database verification remains unresolved; no database changes were made.
- `git diff --check`: exit 0. The rebuilt client bundle contains neither the credential variable name nor the test-only credential marker.

The existing browser color-environment warnings remain. No UI changed or new manual browser inspection occurred. Live crawling remains disabled, no real provider call was made, and no commit was created. Stop at this task's boundary; the live-crawl prerequisites above remain separate work.
