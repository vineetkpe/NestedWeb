# Quick Start

## First 60 seconds

1. Open [INDEX.md](INDEX.md) and read the current status.
2. Open [project-checklist.md](project-checklist.md) for the current checklist.
3. Open [task-history.md](task-history.md) to see what has already been completed.
4. Follow [working-rules.md](working-rules.md) before making any changes.

## Current focus

- Levels 1 through 6 are fully implemented and verified.
- The complete 4-step workflow (**Measure → Explain → Recommend → Monitor**) is 100% operational.
- Live Supabase cloud backend (`ckekmlrybsztcplqaipu`) and Google Gemini 2.5 Flash API are connected and healthy.
- Next step: Production platform deployment and live agency validation flows.

## Current next task

- Deploy production application to target hosting platform (e.g. Vercel).
- Execute live agency validation runs using real client SaaS domains.
- Monitor background worker queues and telemetry via `/admin` and `/api/health`.

## Current verified snapshot

- Complete multi-tenant workspace & project operations with strict RBAC.
- Durable scan execution with worst-case cost reservations and explicit Gemini transport.
- Full intelligence pipeline: citation normalization, mention detection, recommendations, and auditable metrics (`report-metrics-v1`).
- Customer action recommendations engine (`customer-actions-v1`) linked to query evidence.
- Historical scan comparison and monitoring engine (`scan-comparison-v1`) with trajectory analysis.
- Live `/api/health` diagnostic reports 100% healthy with both providers configured.
- 742 unit tests and 14 Playwright e2e tests passing, 0 lint warnings, 0 type errors, 0 audit vulnerabilities.

## Minimum verification before claiming success

- Run the relevant build check.
- Run the relevant route or unit test.
- Confirm the actual output, not assumptions.

## Links

- [INDEX.md](INDEX.md)
- [project-checklist.md](project-checklist.md)
- [task-history.md](task-history.md)
- [working-rules.md](working-rules.md)
- [../ARCHITECTURE.md](../ARCHITECTURE.md)
