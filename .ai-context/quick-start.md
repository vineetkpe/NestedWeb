# Quick Start

## First 60 seconds

1. Open [INDEX.md](INDEX.md) and read the current status.
2. Open [project-checklist.md](project-checklist.md) for completed milestones and active tasks.
3. Open [task-history.md](task-history.md) to see recent verified commits and database operations.
4. Follow [working-rules.md](working-rules.md) before making any changes.

## Current focus

- Levels 1 through 6 are fully implemented, verified, and pushed to GitHub `origin/main`.
- The complete 4-step workflow (**Measure → Explain → Recommend → Monitor**) is 100% operational.
- Live Supabase cloud backend (`ckekmlrybsztcplqaipu`) and Google Gemini API (`gemini-3.6-flash`) are connected and healthy.
- Scan controls auto-provisioning migration is deployed, and scan ID `bb5b323b-a913-4059-8591-849c3d718da6` was successfully reserved and claimed.

## Current active tasks

- Complete live Gemini 3.6 Flash query execution on staging agency project (`Resend` / `resend.com`).
- Verify observation persistence and citation normalization on live database.
- Inspect live connected report display on `/report?workspaceId=...&projectId=...`.
- Monitor background worker queue and telemetry via `/admin` and `/api/health`.

## Current verified snapshot

- Complete multi-tenant workspace & project operations with strict RBAC.
- Durable scan execution with worst-case cost reservations and explicit Gemini transport.
- Full intelligence pipeline: citation normalization, mention detection, recommendations, and auditable metrics (`report-metrics-v1`).
- Customer action recommendations engine (`customer-actions-v1`) linked to query evidence.
- Historical scan comparison and monitoring engine (`scan-comparison-v1`) with trajectory analysis.
- Live `/api/health` diagnostic reports 100% healthy with both providers configured.
- 742 unit tests and 14 Playwright e2e tests passing, 0 lint warnings, 0 type errors, 0 audit vulnerabilities.

## Minimum verification before claiming success

- Run `npm run check` (format, lint, types).
- Run `npm run test:unit`.
- Confirm actual terminal output and live API responses, not assumptions.

## Links

- [INDEX.md](INDEX.md)
- [project-checklist.md](project-checklist.md)
- [task-history.md](task-history.md)
- [working-rules.md](working-rules.md)
- [../ARCHITECTURE.md](../ARCHITECTURE.md)
