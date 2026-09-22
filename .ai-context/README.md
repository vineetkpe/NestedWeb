# AI Context Pack

This folder preserves the working project context so future coding sessions, different AI models, or external collaborators can resume from the same source of truth without guessing.

## Purpose

- maintain the product checklist and current status
- capture coding rules and architectural constraints
- keep task history and completed work
- explain the implementation order to follow
- reduce drift when the repo is reused by other AI systems

## Files in this pack

- [INDEX.md](INDEX.md) — the quick navigation page for the context pack
- [project-checklist.md](project-checklist.md) — the current product and engineering checklist
- [working-rules.md](working-rules.md) — the non-negotiable rules for this project
- [task-history.md](task-history.md) — the completed work log and what remains
- [deployment-architecture.md](deployment-architecture.md) — 2-server architecture blueprint
- [quick-start.md](quick-start.md) — first 60 seconds onboarding guide
- [handoff-template.md](handoff-template.md) — reusable summary template for future AI sessions

## Important rules

1. This repo is the real app root for the AI Visibility OS project.
2. Continue in product-order sequence. Do not jump to report/dashboard/monetization work before Level 1 foundations are validated.
3. Keep the app truthful: no fabricated metrics, observations, citations, or customer claims.
4. Use explicit server/client boundaries and verify with the project checks.
5. Preserve existing work; do not overwrite unrelated changes.
6. When a task is done, record it in `task-history.md` and update the checklist.

## Current repo reality

Levels 1 through 6 are fully implemented and verified across domain, application, infrastructure, and UI. The core agency workflow (**Measure → Explain → Recommend → Monitor**) is 100% complete:

- **Measure**: Native entry-page crawling (with 64KB SVG support), business profile extraction, prompt synthesis, cost reservation, and durable scan execution.
- **Explain**: Citation normalization, entity mention detection with character spans, recommendation classification, and auditable visibility metrics (`report-metrics-v1`).
- **Recommend**: Deterministic customer action recommendations (`customer-actions-v1`: Comparison Defense, Citation Building, Content Expansion) linked to specific query evidence.
- **Monitor**: Historical scan comparison engine (`scan-comparison-v1`: mathematical deltas, query shifts, trajectory classification) and connected comparison panel in `/report`.
- **Cloud & AI Integration**: Live Supabase project (`ckekmlrybsztcplqaipu`) and Google Gemini API (`gemini-3.6-flash`) connected and verified healthy via `/api/health`.
- **Worker Infrastructure**: `/api/worker/scan` operational with `CRON_SECRET` constant-time security and queue claim logic.

## Latest verified status

- `npm run check` passed: Prettier, ESLint, and strict TypeScript types passing with 0 errors.
- `npm run test:unit` passed: 742 unit tests passing, 0 failing.
- 14 Playwright e2e tests passing (Desktop & Mobile Chromium, zero WCAG AA accessibility violations).
- 0 security vulnerabilities in `npm audit`.
- `/api/health` reports 100% `status: "healthy"` with both Supabase and Gemini marked `"configured"`.
- Next step: Staging agency validation with live query execution and customer report display.
