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
- [handoff-template.md](handoff-template.md) — a reusable summary template for future AI sessions

## Important rules

1. This repo is the real app root for the AI Visibility OS project.
2. Continue in product-order sequence. Do not jump to report/dashboard/monetization work before Level 1 foundations are validated.
3. Keep the app truthful: no fabricated metrics, observations, citations, or customer claims.
4. Use explicit server/client boundaries and verify with the project checks.
5. Preserve existing work; do not overwrite unrelated changes.
6. When a task is done, record it in `task-history.md` and update the checklist.

## Current repo reality

The app remains in the foundation/product-order slice. The verified work includes the workspace bootstrap flow, the project setup flow, and the project listing/selection state, but the full SaaS report and scan pipeline are still ahead of the current implementation boundary.

## Latest verified status

- `npm run verify` passed on the current repo state.
- The repository is consistent with the actual implemented product boundary: workspace/project foundation is the current proven slice.
- The next product step is the authenticated scan execution boundary after project selection is confirmed.
