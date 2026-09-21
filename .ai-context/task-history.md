# Task History

## 2026-09-20

- Reconciled repo root and working state.
- Confirmed the app is in the product-order foundation slice, not a completed SaaS product.
- Added project workspace route and signed-in tenant setup boundary.
- Added project setup form fields for workspace ID, project name, and tracked website.
- Added a current-projects section and project list UI boundary.
- Strict verification of the route contract completed in a fresh production build.

## 2026-09-21

- Refactored `projects-server.ts` to export pure, testable server compositions (`executeVerifiedCurrentUserProjectList`, `executeVerifiedCurrentUserProjectCreate`).
- Mapped unauthenticated session errors fail-closed to `authorization_denied` at the server action boundary.
- Added comprehensive unit tests in `src/infrastructure/supabase/projects-server.test.ts` covering signed-out rejection, non-member rejection, authorized listing, and project creation.
- Wired `/workspace` scan launch action (`prepareProjectScanAction`) into `runCurrentUserProjectBoundedScan` with truthful preparation & execution status inspection.
- Added end-to-end unit test in `project-bounded-scan-server.test.ts` verifying the complete scan preparation and claim pipeline up to gated provider execution.
- Diagnosed CI checkout failure caused by phantom `NestedWeb` submodule entry (mode 160000); removed cached entry and pushed commit `8cda474`.
- Confirmed GitHub Actions CI run (#35617487687) passed 100% green (`verify` and `database-security` both succeeded).
- Implemented Level 3 Intelligence application orchestration (`src/application/scan-intelligence.ts`) coordinating citation normalization (`normalizePersistedCitations`) and entity mention detection (`detectPersistedMentions`) with fail-closed boundary validation and failure isolation.
- Implemented `evaluateMentionRecommendations` evaluating positive brand mentions with exact response evidence spans using `detectRecommendationForMention`.
- Implemented server-only Supabase adapter (`src/infrastructure/supabase-scan-intelligence.ts`) composing citation and mention database RPCs atomically.
- Created unit test suites (`scan-intelligence.test.ts` and `supabase-scan-intelligence.test.ts`) covering request validation, deduplication, multi-observation aggregation, partial failure isolation, and evidence span extraction.
- Implemented pure visibility metrics calculation engine (`src/domain/visibility-metrics.ts`) following `report-metrics-v1`:
  - `calculateMentionRate`: measures percentage of eligible answers with an unambiguous target brand mention.
  - `calculateRecommendationRate`: measures percentage of eligible answers where target brand was explicitly recommended.
  - `calculateAiShareOfVoice`: measures target brand's share of total brand mentions across a declared target + competitor set.
  - `calculateCitationShare`: measures percentage of eligible cited URLs matching the tracked company domain scope with strict hostname/subdomain spoof prevention.
  - `calculateCompetitorGap`: computes percentage points difference in positive recommendation rate between competitor and target brand.
  - `calculateScanVisibilityMetrics`: aggregates the complete metrics suite with explicit observation-level exclusion reasons (`observation_unanswered`, `mention_ambiguous`, `recommendation_unknown`, etc.).
- Implemented application service (`src/application/scan-metrics.ts`) orchestrating metrics calculation from structured observation intelligence records.
- Added comprehensive unit test suites (`visibility-metrics.test.ts` and `scan-metrics.test.ts`) covering domain boundary rules, spoof prevention, rate rounding, zero-denominator unavailable states, and end-to-end multi-observation scenarios.
- Implemented Level 4 Product connected reporting in `/report` and `/workspace`:
  - Updated `ProjectListPanel` with an accessible "View AI Visibility Report →" action carrying workspace and project parameters.
  - Upgraded `ReportPage` to accept optional `workspaceId` and `projectId` search parameters, safely querying the tenant's projects via `listCurrentUserProjects` while preserving the empty prototype experience when no parameters are present.
  - Displays authenticated client name, tracked domain, connected client banner, and truthful "Awaiting scan execution" status without fabricating scan observations or metrics.
  - Passes full test verification: 691 unit tests, 14 Playwright e2e tests (desktop and mobile), 0 lint warnings, clean production build, and 0 audit vulnerabilities.
- Implemented Level 5 Monetization (Plan Tiers, Usage Accounting & Entitlement Enforcement):
  - Created `src/domain/plan-entitlements.ts` and test suite: pure deterministic plan catalog (`free_tier`, `agency_starter`, `agency_pro`), explicit limits (project count, monthly scans, queries per scan, concurrent scans, worst-case budget), and fail-closed entitlement validation.
  - Created `src/application/plan-entitlements.ts` and test suite: application service orchestrating server-side quota verification (`verifyProjectCreationQuota`, `verifyScanExecutionQuota`, `getWorkspaceQuotaSummary`) with fail-closed error propagation.
  - Created `src/app/workspace/plan-usage-panel.tsx` and wired it into `/workspace`: displays authentic workspace plan name, active tier badge, project quota meter, monthly scan consumption, and concurrency limits without fabricated statistics.
  - Passes full test verification: 700 unit tests, 14 Playwright e2e tests (desktop and mobile), 0 lint warnings, clean production build, and 0 audit vulnerabilities.

## Current status after the latest task

- Full project scan pipeline (crawl → profile extraction → prompt generation → cost reservation → targeted claim) is verified through live provider gating.
- Level 3 Intelligence orchestration is complete: raw observations remain immutable, citations normalized, span-accurate brand mentions detected, conservative recommendations classified, and auditable visibility metrics engine (`report-metrics-v1`) verified.
- Level 4 Product is connected: workspace project selection directly deep-links to authentic client-specific visibility reports.
- Level 5 Monetization is implemented: server-side plan entitlements, usage accounting, and scan execution quotas are verified and integrated into the workspace.
- Full verification (`npm run verify`, 700 unit tests, 14 e2e tests) passes on the current repo state with 0 audit vulnerabilities.

## Remaining work

- Begin Level 6 Production: observability, operational signals, security testing, performance budgets, and deployment verification.
- Implement scan history comparison and customer action recommendations.
- Keep updating this file whenever a task is completed or the next concrete step is chosen.

