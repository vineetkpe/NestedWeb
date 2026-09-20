# AI Context Pack

This folder preserves the working project context so future coding sessions, different AI models, or external collaborators can resume from the same source of truth without guessing.

## Purpose

- maintain the product checklist and current status
- capture coding rules and architectural constraints
- keep task history and completed work
- explain the implementation order to follow
- reduce drift when the repo is reused by other AI systems

## Files in this pack

- `project-checklist.md` — the current product and engineering checklist
- `working-rules.md` — the non-negotiable rules for this project
- `task-history.md` — the completed work log and what remains
- `handoff-template.md` — a reusable summary template for future AI sessions

## Important rules

1. This repo is the real app root for the AI Visibility OS project.
2. Continue in product-order sequence. Do not jump to report/dashboard/monetization work before Level 1 foundations are validated.
3. Keep the app truthful: no fabricated metrics, observations, citations, or customer claims.
4. Use explicit server/client boundaries and verify with the project checks.
5. Preserve existing work; do not overwrite unrelated changes.
6. When a task is done, record it in `task-history.md` and update the checklist.

## Current repo reality

The app is still in the foundation/product-order slice. The implemented and verified work is mostly the authenticated workspace/project setup boundary, not the full SaaS flow.
