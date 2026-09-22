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
- [x] Project list selection state is visible and explicit in the UI
- [x] Project scan launch validation exists for workspace/project/worker IDs and lease bounds
- [x] Workspace and project ID validation now rejects malformed inputs before DB or scan work
- [x] Build verification passes
- [x] Route regression verifies workspace-project flow contract
- [x] Full `npm run verify` passes on the current repo state
- [x] Real authenticated project listing and creation server boundaries are proven with automated tests
- [x] Workspace member authorization and project selection flow are verified fail-closed
- [x] Authenticated project scan execution boundary wired and verified through provider gating
- [x] Raw observation citation normalization and brand mention detection orchestration verified (Level 3 Intelligence slice 1)
- [x] Recommendation interpretation, competitor analysis, and auditable visibility metrics engine verified (Level 3 Intelligence slice 2)
- [x] Connected workspace client project reporting & evidence views built (Level 4 Product)
- [x] Plan tiers, server-side usage accounting, and scan limits implemented (Level 5 Monetization)
- [x] Customer action recommendations engine and query linking implemented (`customer-actions-v1`)
- [x] Production health check diagnostic API endpoint implemented (`/api/health`)
- [x] Two-server deployment architecture documented (`.ai-context/deployment-architecture.md`)
- [x] Decoupled standalone marketing landing site in `landing/`
- [x] SaaS entry / auth gateway (`/login`, `/signup`, and `/` routing)
- [x] Live Supabase Auth actions (`src/application/auth-actions.ts`) & PKCE callback (`src/app/auth/callback/route.ts`)
- [x] Open-redirect security protection & domain input validation (`src/domain/auth-validation.ts`)
- [x] Admin Telemetry Domain and Application Service (`src/domain/admin-telemetry.ts`, `src/application/admin-telemetry.ts`)
- [x] Dedicated SaaS Admin Dashboard (`/admin`) with Service Telemetry, Queue, and Tenant analytics
- [x] Enhanced Agency User Dashboard with Project Operations & Customer Actions Panel (`/workspace`)
- [x] Unified SaaS Navigation Header (`src/app/components/app-header.tsx`)
- [x] Live Supabase cloud project connected (`ckekmlrybsztcplqaipu`), Auth (anon) and Admin (service_role) verified 200 OK
- [x] Live Google Gemini 2.5 Flash API key connected and verified against Generative Language API
- [x] Production health diagnostic endpoint reporting 100% healthy (`/api/health` -> healthy)
- [x] Historical Scan Comparison & Monitor Engine (`scan-comparison-v1`, query shifts, trajectory classification)
- [x] Connected Historical Comparison & Monitoring panel in report (`src/app/report/scan-comparison-panel.tsx`)
- [x] Production deployment and observability hardening (Level 6)
- [x] Background scan worker route handler implemented (`/api/worker/scan`) with `CRON_SECRET` timing-safe auth and Vercel Cron compatibility
- [x] Production deployment configuration (`vercel.json`) with recurring cron jobs and strict security headers (HSTS, nosniff, DENY)
- [x] Cloud staging verification of scan worker execution against live Supabase RPC (`ckekmlrybsztcplqaipu`)

## Required guardrails for future work

- Do not skip to report/dashboard work before project + workspace security is proven.
- Do not fabricate metrics, recommendations, citations, or customer outcomes.
- Keep raw evidence separated from derived interpretation.
- Use `src/app` for UI and thin request boundaries only.
- Keep pure rules in `src/domain`, orchestration in `src/application`, and server-only adapters in `src/infrastructure`.
- Enforce authentication and authorization at the server boundary.
- Add tests for each substantive rule and regression.

## The next concrete task

- Deploy to production platform (Vercel/Supabase) and perform staging validation with real agency workflows
- Monitor production health signals and verify scheduled background worker operations
