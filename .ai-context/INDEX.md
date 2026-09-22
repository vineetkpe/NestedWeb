# AI Context Index

This folder is the quick navigation hub for the repository. Use this file first when resuming work or handing off to another model.

## Start here

- [README.md](README.md) — overview and purpose of the context pack
- [project-checklist.md](project-checklist.md) — current checklist, completed milestones, and active deliverables
- [task-history.md](task-history.md) — what has been completed, verified, and pushed
- [deployment-architecture.md](deployment-architecture.md) — 2-server architecture (landing on nestedweb.com vs SaaS on app.nestedweb.com)

## Rules and guardrails

- [working-rules.md](working-rules.md) — architecture, task sequence, and project guardrails
- [handoff-template.md](handoff-template.md) — reusable handoff format for the next AI session

## Quick status

- Current focus: Staging validation with live Gemini execution & customer report display
- Current gate: 742 unit tests, 14 e2e tests, 0 lint warnings, 0 type errors, 0 audit vulnerabilities passing cleanly
- Live database: Supabase (`ckekmlrybsztcplqaipu`) connected, scan controls provisioned and verified active; scan ID `bb5b323b-a913-4059-8591-849c3d718da6` reserved and claimed
- Live AI provider: Google Gemini API connected; `gemini-3.6-flash` verified HTTP 200 OK
- Background worker: `/api/worker/scan` operating with `CRON_SECRET` timing-safe auth and claiming queue items
- Health check: `/api/health` reports status "healthy" (Supabase and Gemini both configured)

## Repo links

- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [../docs/product-scope.md](../docs/product-scope.md)
- [../AGENTS.md](../AGENTS.md)
- [../README.md](../README.md)
