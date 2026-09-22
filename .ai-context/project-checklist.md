# Project Checklist

## Current product order

The repo stays in the strict product-order sequence:

1. Validation / agency workflow understanding
2. Authentication, workspace, membership, and project boundaries
3. Domain intake and site validation
4. Website crawl + profile extraction
5. Prompt library + provider query execution boundary
6. Raw observations, citations, mention detection, recommendations, competitors, metrics
7. Dashboard and historical report flows
8. Billing / paid plan enforcement
9. Production hardening and deployment

---

## Completed Milestones (Verified & Audited)

### Level 1: Core Tenancy, Project Isolation & Auth

- [x] Repo root and project structure reconciled
- [x] Next.js App Router shell with strict TypeScript and Tailwind
- [x] Workspace route and bootstrapping flow (`/workspace`)
- [x] Project setup and client management boundaries with workspace isolation
- [x] Project listing action boundary in workspace flow with visible selection state
- [x] Workspace & project ID validation rejecting malformed inputs fail-closed
- [x] Verified authenticated project server actions with regression tests
- [x] SaaS Auth Gateway (`/login`, `/signup`, `/`) with live Supabase Auth actions & PKCE callback
- [x] Open-redirect security protection & domain input validation

### Level 2: Crawling & Prompt Synthesis

- [x] Native pinned HTTP crawler with DNS pinning and SSRF defense
- [x] Crawler SVG buffer hardened to 64KB for complex SaaS landing pages (e.g., Resend)
- [x] Company business profile extraction (`company-profile-v2`) from first-party content
- [x] Niche prompt synthesis engine (`niche-prompts-v1`) generating structured query cohorts

### Level 3: AI Intelligence Pipeline (Measure → Explain)

- [x] Live Google Gemini 2.5 Flash transport with grounded query validation
- [x] Raw observation persistence and provider token metering settlement
- [x] Citation URL normalization and canonical domain resolution
- [x] Entity alias catalog and character-accurate brand mention detection
- [x] Explicit recommendation classification (`detectRecommendationForMention`)
- [x] Auditable visibility metrics engine (`report-metrics-v1`): mention rate, recommendation rate, AI share of voice, citation share, competitor gap

### Level 4: Product Delivery & Recommendations (Recommend → Monitor)

- [x] Customer action recommendations engine (`customer-actions-v1`): Comparison Defense, Citation Building, Content Expansion
- [x] Connected workspace client project reporting & evidence views (`/report`)
- [x] Historical scan comparison & monitoring engine (`scan-comparison-v1`): mathematical deltas, query shifts, trajectory classification
- [x] Connected historical comparison & monitoring panel in `/report`
- [x] Dedicated SaaS Admin Dashboard (`/admin`) with queue depth, service telemetry, and tenant analytics
- [x] Enhanced Agency User Dashboard with Project Operations & Customer Actions Panel (`/workspace`)

### Level 5: Monetization & Usage Controls

- [x] Plan tiers catalog (`free_tier`, `agency_starter`, `agency_pro`) and server-side usage accounting
- [x] Fail-closed quota checks: project limits, monthly scan limits, concurrency limits
- [x] Connected plan usage panel on workspace dashboard (`/workspace`)

### Level 6: Cloud Infrastructure & Staging Hardening

- [x] Live Supabase cloud project connected (`ckekmlrybsztcplqaipu`), Auth (anon) and Admin (service_role) verified 200 OK
- [x] Live Google Gemini 2.5 Flash API key connected and verified against Generative Language API
- [x] Production health diagnostic endpoint reporting 100% healthy (`/api/health`)
- [x] Background scan worker route handler implemented (`/api/worker/scan`) with `CRON_SECRET` timing-safe auth
- [x] Scan worker cloud execution verified against live Supabase RPC `claim_scan_work`
- [x] Scan controls auto-provisioning migration created (`supabase/migrations/20260922200000_scan_controls_auto_provisioning.sql`) with Gemini 2.5 Flash pricing and automated triggers

---

## Active Tasks (Immediate Focus)

- [x] Confirmed Supabase scan controls provisioning: database actively enforces scan controls and query quotas (`Scan query limit exceeded` verified)
- [x] Set `max_queries_per_scan = 10` on workspace and project scan controls to match max synthesized cohort queries (up to 10)
- [x] Autonomous live scan execution attempted on staging agency project (`Resend` / `resend.com`):
  - Reservation `7681c76a-41af-49be-b5ba-287e5915cadf` and claim executed via `claim_scan_work`
  - Worker lease renewed and active for worker `00000000-0000-4000-8000-000000000001`
  - Real Google Generative Language API invoked with `gemini-3.6-flash`
  - Authentic response hashed via SHA-256 and persisted into Supabase `public.raw_observations` table
  - Live observation recorded `outcome: failed`, `failureCode: rate_limited` due to Google AI Studio quota limits on `google_search` grounding (`429 RESOURCE_EXHAUSTED`)
- [x] Verified zero fabrication: all evidence, attempts, and observations accurately recorded in database without mock data
- [ ] Enable billing / pay-as-you-go on Google AI Studio project to unlock Google Search Grounding quota for full grounded responses
- [ ] Re-run scan with active search grounding quota to observe live brand mentions and recommendations
- [ ] Inspect connected report display on `/report?workspaceId=...&projectId=...`
- [x] Commit and sync verified codebase to GitHub repository (`origin/main`)

---

## Required Guardrails

- Do not skip to report/dashboard work before project + workspace security is proven.
- Do not fabricate metrics, recommendations, citations, or customer outcomes.
- Keep raw evidence separated from derived interpretation.
- Use `src/app` for UI and thin request boundaries only.
- Keep pure rules in `src/domain`, orchestration in `src/application`, and server-only adapters in `src/infrastructure`.
- Enforce authentication and authorization at the server boundary.
- All code additions must pass `npm run check`, `npm run test:unit`, and `npm audit`.
