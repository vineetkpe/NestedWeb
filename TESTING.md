# Testing

## Current runnable checks

```sh
npm ci
npx playwright install chromium
npm run check
npm run build
npm test
npm audit
```

Or `npm run verify` after install/browser setup. PowerShell uses `.cmd` wrappers. `check` runs formatting, lint, and `next typegen` followed by strict TypeScript. `test` runs the Node unit/security suite followed by Playwright against the production build on port 3100; no credentials, real provider calls, or dev-server reuse. Build first after source changes.

Current tests cover honest observation status, methodology navigation, no browser runtime errors, keyboard skip link, desktop/mobile overflow, axe WCAG A/AA checks, security headers, and actual 404 behavior. Playwright captures traces/screenshots on failure; `npx playwright show-report` opens the report. Reports may later contain tenant data: keep them ignored, private, and short-lived.

Report prototype tests additionally exercise navigation from/to the preview, unconfigured company/date, unexecuted templates, separate empty evidence/action states, all five unavailable metrics, absence of fabricated time/source links, section anchors, keyboard flow, axe, and 320px reflow. They save report screenshots in ignored `test-results` for visual review. There are five test definitions across desktop/mobile Chromium (ten cases). Future metric formulas in [report-specification.md](docs/report-specification.md) are documentation only; no calculator tests or populated-data security guarantees are claimed.

`npm run test:unit` uses Node 24's built-in runner and TypeScript type stripping for `src/domain`, `src/application`, and `src/infrastructure` tests. It covers website normalization, malicious URL syntax, IP subnet boundaries, DNS response validation, mixed public/private answers, changed resolution on a later call, cancellation, deadlines, and sanitized failures. DNS tests replace only external resolver methods; no test resolves a public hostname or fetches a website. `allowImportingTsExtensions` supports explicit `.ts` imports under the existing `noEmit` typecheck. The full `verify` command and existing CI now include these tests without new dependencies.

The Firecrawl foundation adds mocked tests for request construction and limits, only-provider-reported page fields, missing/invalid credentials, target identity/immutability, HTTP and provider errors, empty/malformed responses, unsafe returned URLs, oversized response streams, cancellation/deadlines, and the unavailable default live path. No real key, DNS, or HTTP exchange is used. The unit command now enables Node's `react-server` condition for the credential-bearing module's `server-only` guard; a child process without that condition verifies that the import is rejected. Browser tests retain their normal Next.js conditions. The only added dependency is the exact `server-only` marker package, not a provider SDK.

Company-profile tests exercise the pure application extractor using deterministic, explicitly test-only crawl fixtures. They cover every supported profile field, sparse/missing/empty content, scalar conflicts and conflicting headquarters, collection aggregation, duplicate evidence, exact CRLF/Unicode spans, unchanged raw input, malformed/oversized input, failed crawls/HTTP pages, untrusted HTML/instructions/links, quoted and fenced/indented code, ambiguous customer examples across paragraphs, Setext heading context, and styled placeholders/retracted claims. One composition test passes the real Firecrawl normalizer's output to extraction. No LLM, live crawl, or database is used; the existing `test:unit` glob includes these tests without changing scripts.

A draft database integration suite exists at `supabase/tests/core_tenancy_test.sql`; it has not executed successfully because the local Supabase database is unavailable. This is an unresolved check, not a passing suite. Domain intake and company-profile extraction have no Supabase dependency.

`npm run test:db` runs the pgTAP suite against local Supabase only. It is separate from `npm run verify`; passing the application checks does not prove tenant isolation. The database suite uses test-only Auth users, two tenants, real anonymous/authenticated role checks, and a transaction that rolls back its fixtures. It includes a forced second-insert failure to test workspace bootstrap atomicity. Never run these fixtures on a customer project. Replay the migration in a disposable local database, pass this suite, run database lint/advisors, and generate types before hosted rollout. Database CI integration remains pending local verification.

## First business feature

Use Node's built-in test runner for pure TypeScript rules where Node's supported type stripping suffices (`node --test src/domain/*.test.ts`, explicit `.ts` imports). Add a dedicated runner only if module/runtime needs justify it. Use discriminated fixtures for valid, empty, malformed, truncated, refused, rate-limited, and timeout provider outcomes; freeze time/model settings in tests. Never use paid live calls in ordinary CI.

For each risk, add the test with its implementation:

| Boundary       | Required evidence                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth / tenancy | Signed-out, nonmember, member, revoked member; every CRUD operation; changed workspace/parent IDs; genuine DB roles, not service-role-only tests        |
| Membership     | Cannot self-promote/join arbitrary tenant; bootstrap atomic; last owner protected                                                                       |
| Normalization  | Malformed schema, absent citations, duplicate references, HTML/script text, unknown model fields, parser-version change                                 |
| Metrics        | Zero eligible samples yields unavailable; true zero distinct; exclusion counts; duplicate observations; mismatched cohorts; exact numerator/denominator |
| Jobs           | Duplicate enqueue, stale lease, concurrent claims, timeout, retry budget, partial success, cancellation, crash after paid response                      |
| Entitlements   | Concurrent budget reservation, replay, failed call settlement, exhausted/unknown budget denied                                                          |
| UI             | Real auth/project/evidence flow, keyboard, empty/loading/error/partial states, mobile, axe                                                              |

Introduce Supabase CLI/Docker and `supabase test db` with migrations; run integration checks in CI then. Test RLS policies and grants as anonymous/authenticated roles for two tenants, plus composite FK denial. Replay migrations from an empty local DB and generate types.

## Manual verification

Inspect screenshots at desktop and mobile widths and reflow at 320px/200% zoom. Use keyboard navigation and visible focus; check reduced-motion behavior and long evidence URLs. Automated axe does not test every WCAG requirement. Add Firefox/WebKit when critical interactions exist; current Chromium coverage is not cross-browser certification.

Use the installed Playwright skill for exploration. The pinned local Playwright runner remains the source for repeatable tests. No scraping infrastructure, separate Python runtime, global browser process, or production auth snapshots are required.
