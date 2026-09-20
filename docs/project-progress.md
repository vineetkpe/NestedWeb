# Project progress

Source baseline: `7190ab0`, inspected 2026-09-20. This is a code and delivery inventory, not a claim about live services.

We are building AI Visibility OS for SEO/GEO agencies serving B2B SaaS clients: measure their clients' presence in AI answers, explain the evidence, recommend actions, and monitor changes.

## Completion and percentages

The earlier conversational estimate of 40–50% overall completion had no defined denominator and is withdrawn. Source files, commits, and test counts cannot measure remaining product effort.

The measurable customer-workflow checklist is **0 of 4 fully delivered in the routed application (0%)**. This measures connected customer delivery, not backend code completion. A stage earns credit only when its acceptance condition below is demonstrated; partial backend work is listed separately. No weighted overall engineering percentage is claimed.

| Customer stage | Acceptance condition                                                                              | Current gap                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Measure        | Signed-in agency member runs a bounded project scan and inspects saved real answers/sources       | Backend pieces exist; no connected customer route or verified live end-to-end run recorded here       |
| Explain        | Member sees evidence-linked mentions, recommendation detection, competitors and auditable metrics | Citation/mention layers exist; recommendation persistence, competitor analysis, metrics and UI remain |
| Recommend      | Member can choose a specific supported action with evidence and limitations                       | Customer action generation and presentation remain                                                    |
| Monitor        | Member compares compatible historical scans and sees changes                                      | Durable records exist; history/comparison workflow remains                                            |

## What exists and what remains

| Area           | Implemented source evidence                                                                                        | Remaining delivery work                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Validation     | Five agency conversations reported in [agency validation](agency-validation.md)                                    | Individual findings, paid-pilot outcome and closure decision                                                                       |
| Foundation     | `src/infrastructure/supabase-auth.ts`, workspace authorization/bootstrap, projects, migration/RLS suites           | Login/session UI and authenticated project workflow; current environment verification                                              |
| Collection     | `native-entry-crawler.ts`, company-profile extraction, deterministic prompt generation, `createLiveGeminiProvider` | Controlled real-run verification and deployment egress validation; crawler is one static entry page, not a browser/full-site crawl |
| Scan execution | Request-scoped project runner, reservations, leases, renewal/finalization and raw observation storage              | Customer entry point, operational worker hosting/scheduling and recovery verification                                              |
| Intelligence   | Citation normalization/persistence, alias catalog, mention spans/persistence, pure recommendation classifier       | Recommendation persistence/orchestration, competitor analysis, metrics and evidence-backed customer actions                        |
| Product        | Accessible static `/` and `/report` previews                                                                       | Real data dashboard, evidence views, history and populated reports                                                                 |
| Monetization   | Backend scan cost reservation/metering controls                                                                    | Paid plans, billing integration and customer usage experience                                                                      |
| Production     | Application/database CI definitions, security documentation and historical tenancy checks                          | Current CI results, deployment, operational monitoring, recovery/performance/final QA                                              |

Relevant implementation lives in `src/domain`, `src/application`, `src/infrastructure` and `supabase`; only the two static pages live under `src/app`. See [architecture](../ARCHITECTURE.md) for boundaries and [security exit](security-exit.md) for the scope of historical hosted evidence. Presence of migrations does not prove current hosted migration parity.

The existing `src/proxy.ts` conditionally verifies Supabase claims and refreshes session cookies when configured, including on preview requests. This session maintenance is implemented; the customer login and authorized project screens are not.

## Portion 1: verification and status repair

- Confirmed defect: the unit-test command selected only immediate infrastructure files and omitted all three test files under `src/infrastructure/supabase`.
- Fix: include that existing directory in the test command, so `npm run verify` and CI exercise those auth/scan server boundaries.
- The newly included tests exposed an extensionless `next/headers` import that Node could not resolve. Use the package's existing `next/headers.js` entry so the server tests can execute under native Node ESM.
- Correct outdated current-status summaries in README, agent instructions, architecture, product scope, security and testing documents.
- Keep existing production behavior and the parent checkout's unfinished work intact.

Verification on 2026-09-20:

- Test discovery comparison: all 56 source test files selected; previously three were omitted.
- Focused nested server tests: 9 passed after the import fix (before it, two files failed to load).
- `npm run verify`: passed formatting, lint, strict types, production build, 643 unit tests and 10 desktop/mobile browser tests.
- `npm audit`: zero vulnerabilities.
- `npm run test:db`: unavailable; local Postgres refused the connection on port 54322. Docker CLI was not available in this session. Database tests are not claimed as passing.
- `git diff --check`: passed. Independent review found and resolved an omitted description of the existing session proxy; final review had no remaining findings.

Next.js emitted a warning about the parent checkout's lockfile outside this nested Git repository; checks passed. No live provider calls, hosted database verification, production deployment or manual UI changes were performed. Database tests are separate from application verification; mocks do not verify hosted services.

## Next small portions

1. Deliver and verify the Level 1 signed-in workspace/project workflow, beginning with a bounded login/session slice and its security prerequisites.
2. Expose one authorized bounded scan and saved evidence view after validating provider, budget and deployment prerequisites.
3. Complete recommendation persistence, competitor interpretation and auditable metrics in separate slices.
4. Add supported customer actions, compatible history, billing and production operations in their applicable level order.

Each portion needs its own acceptance boundary and fresh checks. This list is a backlog, not a claim that these features are implemented or authorization to batch them into this change.
