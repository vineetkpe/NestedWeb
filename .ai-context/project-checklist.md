# Project Checklist

## Current product order

The repo must stay in the correct sequence. The current acceptable path is:

1. Validation / agency workflow understanding
2. Authentication, workspace, membership, and project boundaries
3. Domain intake and site validation
4. Website crawl + profile extraction
5. Prompt library + provider query execution boundary
6. Raw observations, citations, mention detection, recommendations, competitors, metrics
7. Dashboard and historical report flows
8. Billing / paid plan enforcement
9. Production hardening and deployment

## Current status (honest snapshot)

Completed or partially completed:

- [x] Repo root and project structure are reconciled
- [x] Next.js app shell exists and builds
- [x] Workspace route exists
- [x] Workspace bootstrapping form exists
- [x] Project setup form exists
- [x] Workspace ID is explicitly included in the project setup flow
- [x] Current projects section exists for the workspace boundary
- [x] Project listing action boundary is in the workspace flow
- [x] Build verification passes
- [x] Route regression verifies workspace-project flow contract
- [ ] Real authenticated project listing against live Supabase is proven
- [ ] Real project selection / workspace member authorization is fully tested
- [ ] Level 2 scanning and provider boundary work begins
- [ ] Raw observation/citation interpretation workflow starts
- [ ] Recommendation/competitor/metrics layer begins
- [ ] Dashboard/report UI and history are built
- [ ] Billing / usage limits are implemented
- [ ] Production deployment work completes

## Required guardrails for future work

- Do not skip to report/dashboard work before project + workspace security is proven.
- Do not fabricate metrics, recommendations, citations, or customer outcomes.
- Keep raw evidence separated from derived interpretation.
- Use `src/app` for UI and thin request boundaries only.
- Keep pure rules in `src/domain`, orchestration in `src/application`, and server-only adapters in `src/infrastructure`.
- Enforce authentication and authorization at the server boundary.
- Add tests for each substantive rule and regression.

## The next concrete task

- build the real workspace-member project list/select authorization path
- validate the project is only accessible within the correct signed-in workspace
- then move into the scan execution boundary
