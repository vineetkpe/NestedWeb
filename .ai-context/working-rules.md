# Working Rules for This Project

## Project identity

- Repository root: `c:/NestedWeb`
- App: AI Visibility OS
- Stack: Next.js App Router + React + TypeScript + Tailwind + Supabase + Node 24

## Architecture rules

- `src/app` = UI and thin request entry points
- `src/application` = orchestration/use cases
- `src/domain` = pure business rules and explicit domain types
- `src/infrastructure` = server-only adapter code for DB/provider access

## Mandatory principles

- No fabricated metrics, observations, citations, recommendations, or timestamps
- Keep raw observation, interpretation, metric, and recommendation separate
- Use fail-closed validation at trust boundaries
- No `any`, `@ts-ignore`, or fake assertions to bypass type safety
- Prefer minimal correct solutions over speculative frameworks or abstraction
- Keep server-side auth and entitlement logic server-only
- Do not expose secrets via `NEXT_PUBLIC_*`, logs, URLs, or client bundles

## Task order rules

- Follow Level 0–6 sequence; do not jump ahead
- The workspace + project foundation is required before scan/report logic
- The next task must be smaller and bounded
- Record any order change in `ARCHITECTURE.md`

## Verification rules

- Build and relevant tests must pass before claiming success
- Use the project verification commands for the relevant task
- Keep evidence in the terminal output and document honest limitations
- The current repo evidence is: `npm run verify` passed in the active workspace

## Repo hygiene

- Preserve unrelated changes
- Do not reset the repo without instruction
- Keep the repo consistent between local files and any pushed GitHub state
- When work is finished, update status docs and the task log
