# Domain intake implementation plan

**Goal:** Complete only the user's standalone domain/URL intake and SSRF target-screening task.

**Architecture:** Native URL parsing and pure IP rules; bounded DNS orchestration with an injected resolver; a Node DNS adapter. No Supabase dependency, HTTP fetching, Firecrawl, auth, billing, migrations, UI, or commits.

**Spec:** User's twelve requirements and stop condition; ARCHITECTURE.md ADR-007; SECURITY.md; docs/report-specification.md company and citation contracts.

## Deliverable and acceptance

- `src/domain/website.ts`: `normalizeWebsite(input: unknown)` returns a discriminated result with HTTPS origin and exact normalized hostname, or a safe error code. Test normal values, IDNs, paths, ports, URL ambiguity, credentials, internal names, and IP literals.
- `src/domain/public-address.ts`: `isPublicAddress(input: unknown)` conservatively accepts ordinary public IPv4/IPv6 and rejects special/internal/malformed representations. Test both ends of denied subnets and public neighbors.
- `src/application/website-target.ts`: `prepareWebsiteTarget(input, resolveAddresses, signal?)` validates all resolver output, applies a deadline/cancellation, and returns only checked addresses. Test private DNS, mixed families, rebinding on a later call, no DNS on invalid input, malformed/oversized answers, cancellation, deadline, and sanitized failures.
- `src/infrastructure/website-dns.ts`: `resolveWebsiteAddresses(hostname, signal)` uses native A/AAAA resolution and cancellation; only absent record families are treated as empty. Tests replace external DNS methods, never issue public DNS or HTTP requests.
- `package.json` and `tsconfig.json`: add `test:unit`, include it in `test`/`verify`, and enable explicit TypeScript imports. No dependency changes.
- Update architecture, security, and testing docs with the exact boundaries and results.

## Execution

- [x] Inspect current changes, architecture, report specification, security/testing contracts, and native API/IANA references. Preserve prior work.
- [x] Record the bounded Level 2 sequencing exception before code changes.
- [x] Write tests before implementing each module. Initial runs failed because the new modules did not yet exist; those runs are not claimed as failing policy assertions. The later synchronous-cancellation regression reproduced an unhandled rejection and passed after correcting promise handling.
- [x] Implement normalization, address classification, and bounded DNS screening; all 227 unit/security tests pass.
- [x] Review actual changes for security, type safety, and scope; run `npm run verify`, `npm run test:db`, `npm audit`, and `git diff --check`.
- [x] Record exact changes/results and remaining limits for handoff. Stop at this task without committing.

No successful normalization or DNS snapshot permits a later hostname-based fetch. A future transport must connect using checked addresses and revalidate each redirect/retry; this task performs no HTTP requests.

## Verification — 2026-09-08

- `npm run verify`: exit 0. Formatting, lint, strict types, production build, 227 unit/security tests, and 10 desktop/mobile Chromium tests passed. The existing browser suite includes keyboard and axe checks; the task changed no UI and required no new manual UI inspection.
- `npm run test:db`: exit 1 before SQL execution, `ECONNREFUSED 127.0.0.1:54322`. Local Supabase is unavailable; no database assertion is reported as passing. This does not block the independent domain layer.
- `npm audit`: exit 0, zero vulnerabilities.
- `git diff --check`: exit 0. Reviewed tracked diffs and all new module/test files.
- The browser runner emitted its existing `NO_COLOR`/`FORCE_COLOR` environment warnings. No failing application check was suppressed.
- Hashes before/after confirm the MCP configuration, package lock, existing migration, database tests, and Supabase configuration are unchanged. No auth, billing, Firecrawl, HTTP client, route, database, or UI implementation was changed. No new dependency, network crawl, or commit.

Files added: `src/domain/website.ts`, `src/domain/public-address.ts`, `src/application/website-target.ts`, `src/infrastructure/website-dns.ts`, their four adjacent `.test.ts` files, and this plan. Existing files changed for this task: `package.json` (unit-test command and test wiring), `tsconfig.json` (explicit TypeScript imports), `ARCHITECTURE.md` (ADR-007), `SECURITY.md` (intake/DNS policy and transport limits), and `TESTING.md` (unit/security test instructions). Earlier uncommitted work remains preserved.
