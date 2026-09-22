# AI Handoff Document

## Project snapshot

- **Repo Root**: `c:/NestedWeb`
- **Main Branch**: `main` (synced to `origin/main` on `github.com/vineetkpe/NestedWeb`)
- **Node & Runtime**: Node 24.19.0, Next.js 16.3.4 (Turbopack), React 19.2.8, strict TypeScript
- **Target ICP**: SEO/GEO agencies serving B2B SaaS clients
- **Core Workflow**: Measure → Explain → Recommend → Monitor

## Live Environment & Infrastructure Status

- **Database**: Live Supabase project (`ckekmlrybsztcplqaipu.supabase.co`)
  - Auth, project tenancy, and RLS verified.
  - Scan controls table active (`app_private.workspace_scan_controls`, `app_private.project_scan_controls`).
  - Scan reservation tested and verified (`bb5b323b-a913-4059-8591-849c3d718da6` reserved and claimed).
- **AI Provider**: Google Generative Language API
  - Active model: `gemini-3.6-flash` (verified HTTP 200 OK with search grounding).
- **Background Worker**:
  - `/api/worker/scan` route operational with `CRON_SECRET` constant-time verification.
- **Health Endpoint**:
  - `/api/health` reports status `healthy` with both services configured.

## What is fully implemented & verified (Levels 1–6)

1. **Level 1 (Tenancy & Auth)**: Multi-tenant workspace creation, membership checks, project scoping, auth gateway (`/login`, `/signup`), open-redirect defense.
2. **Level 2 (Intake & Crawl)**: Native pinned HTTP crawler (64KB SVG buffer), business profile extraction, niche prompt generation (`niche-prompts-v1`).
3. **Level 3 (Intelligence)**: Observation persistence, citation normalization, mention detection, recommendation classification, visibility metrics (`report-metrics-v1`).
4. **Level 4 (Product)**: Customer actions engine (`customer-actions-v1`), connected report view (`/report`), historical monitor (`scan-comparison-v1`), Admin dashboard (`/admin`), Agency dashboard (`/workspace`).
5. **Level 5 (Monetization)**: Tier catalog (`free_tier`, `agency_starter`, `agency_pro`), server-side quota checks, workspace usage panel.
6. **Level 6 (Observability & Hardening)**: Production health probe, cron worker route, deployment headers, auto-provisioning migration.

## Active Deliverables / Next Steps

1. Run the live Gemini 3.6 Flash scan queries against project `Resend` (`resend.com`).
2. Verify observation rows in `public.raw_observations` and citation normalization in `public.citation_url_normalizations`.
3. Inspect `/report?workspaceId=6e2c9db4-d7f0-4290-b59a-865936bfb19a&projectId=b8d526ba-12de-461c-969f-4a90ba2390b2` for real metrics, customer actions, and monitoring signals.

## Required Rules

- No fabricated metrics, citations, observations, or customer claims.
- Never leak secrets via `NEXT_PUBLIC_*`, page props, logs, URLs, or client bundles (`.env.local` strictly gitignored).
- Pass `npm run check` and `npm run test:unit` before claiming completion.
