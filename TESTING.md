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

Or `npm run verify` after install/browser setup. PowerShell uses `.cmd` wrappers. `check` runs formatting, lint, and `next typegen` followed by strict TypeScript. `test` runs Playwright against the production build on port 3100; no credentials, real provider calls, or dev-server reuse. Build first after source changes.

Current tests cover honest observation status, methodology navigation, no browser runtime errors, keyboard skip link, desktop/mobile overflow, axe WCAG A/AA checks, security headers, and actual 404 behavior. Playwright captures traces/screenshots on failure; `npx playwright show-report` opens the report. Reports may later contain tenant data: keep them ignored, private, and short-lived.

Report prototype tests additionally exercise navigation from/to the preview, unconfigured company/date, unexecuted templates, separate empty evidence/action states, all five unavailable metrics, absence of fabricated time/source links, section anchors, keyboard flow, axe, and 320px reflow. They save report screenshots in ignored `test-results` for visual review. There are five test definitions across desktop/mobile Chromium (ten cases). Future metric formulas in [report-specification.md](docs/report-specification.md) are documentation only; no calculator tests or populated-data security guarantees are claimed.

No domain unit suite or database integration suite exists: there is no business logic or DB implementation to test. This is an explicit absence, not a skipped passing suite. Do not create meaningless tests of static copy solely for coverage.

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
