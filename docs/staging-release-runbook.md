# AI Visibility OS — Staging & Production Release Runbook

This runbook guides operators and engineering teams through deploying, verifying, and operating AI Visibility OS across **Vercel**, **Supabase Cloud**, and **Google Cloud / AI Studio**.

---

## 1. Architecture & Domain Topology

Per [deployment architecture](../.ai-context/deployment-architecture.md), AI Visibility OS uses a decoupled two-domain model:

| Domain                      | Role                     | Hosting Target                                     | Directory Source   |
| --------------------------- | ------------------------ | -------------------------------------------------- | ------------------ |
| `https://nestedweb.com`     | Marketing Landing Site   | Edge Static CDN (Cloudflare Pages / Vercel Static) | `landing/`         |
| `https://app.nestedweb.com` | Next.js SaaS Application | Vercel (Next.js App Router / Node.js 24)           | Repo Root (`src/`) |

---

## 2. Prerequisites & Credentials

Ensure the following credentials and configurations are provisioned:

1. **Supabase Cloud Project**:
   - `NEXT_PUBLIC_SUPABASE_URL`: e.g. `https://ckekmlrybsztcplqaipu.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Public anon/publishable key (`eyJh...`)
   - `SUPABASE_SECRET_KEY`: Server-only secret key (`sb_secret_...` or service role `eyJh...`)
2. **Google Cloud / AI Studio**:
   - `GEMINI_API_KEY`: Generative Language API key with Google Search Grounding quota enabled.
3. **Cron Authentication**:
   - `CRON_SECRET`: Minimum 32-character high-entropy secret string used by Vercel Cron to invoke `/api/worker/scan` and `/api/worker/scheduler`.
4. **Worker Identity**:
   - `NESTEDWEB_SCAN_WORKER_ID`: Dedicated UUID v4 (e.g. `00000000-0000-4000-8000-000000000001`).

---

## 3. Database Migration Sequence

Apply all migrations in `supabase/migrations/` sequentially using the Supabase CLI or Supabase Cloud SQL Editor:

```bash
# Push migrations to linked cloud project
npx supabase db push
```

**Key Migrations Applied:**

- `20260912045433_core_tenancy.sql`: Core workspaces, memberships, projects, profiles with strict RLS.
- `20260912072721_scan_cost_reservation.sql`: Worst-case cost reservations and atomic accounting.
- `20260912092319_scan_worker_leasing.sql`: Distributed worker lease claim RPCs (`claim_scan_work`, `renew_scan_lease`).
- `20260914080500_mention_detection_persistence.sql`: Raw observations, citation normalization, mention detections.
- `20260922200000_scan_controls_auto_provisioning.sql`: Scan controls auto-provisioning triggers and Gemini 2.5 Flash model config.
- `20260928230000_project_scan_schedules.sql`: Automated scan scheduling table, RLS, and auto-provisioning triggers.

---

## 4. Supabase Auth Configuration

In the [Supabase Dashboard](https://supabase.com/dashboard) under **Authentication -> URL Configuration**:

- **Site URL**: `https://app.nestedweb.com`
- **Redirect URLs**:
  - `https://app.nestedweb.com/auth/callback`
  - `https://app.nestedweb.com/*`
  - `http://localhost:3000/*` (for local development)

---

## 5. Vercel Deployment Setup

1. **Connect Repository**:
   - Import `vineetkpe/NestedWeb` on Vercel.
   - Framework Preset: **Next.js**.
   - Node.js Version: **24.x** (configured via `.node-version`).
2. **Configure Environment Variables**:
   Add the following in Vercel Project Settings -> Environment Variables:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
   SUPABASE_SECRET_KEY=<your-secret-key>
   GEMINI_API_KEY=<your-gemini-key>
   CRON_SECRET=<your-high-entropy-cron-secret>
   NESTEDWEB_SCAN_WORKER_ID=<worker-uuid-v4>
   NESTEDWEB_SCAN_LEASE_SECONDS=60
   NESTEDWEB_LIVE_SCAN_WORKER_ENABLED=true
   ```
3. **Automated Vercel Crons**:
   Vercel automatically detects `vercel.json` and registers:
   - `/api/worker/scan` (`*/5 * * * *`): Drains and executes queued scans every 5 minutes.
   - `/api/worker/scheduler` (`0 * * * *`): Evaluates due project monitoring cadences and enqueues scans hourly.

---

## 6. Preflight Verification & Health Check

Before routing production traffic:

1. **Run Local Preflight**:

   ```bash
   npm run preflight
   ```

   Ensures all required environment variables conform to format invariants and confirms network connectivity to Supabase.

2. **Verify Production Health Endpoint**:
   ```bash
   curl -i https://app.nestedweb.com/api/health
   ```
   Expected response:
   ```json
   {
     "status": "healthy",
     "timestamp": "...",
     "uptimeSeconds": 42,
     "environment": "production",
     "version": "0.1.0",
     "services": {
       "supabase": "configured",
       "gemini": "configured",
       "scheduler": "configured",
       "worker": "configured"
     }
   }
   ```

---

## 7. Emergency Procedures & Kill Switches

Per [OPERATIONS.md](../OPERATIONS.md):

1. **Provider Kill Switch (Stop Paid AI Calls)**:
   In Supabase SQL Editor:
   ```sql
   UPDATE app_private.scan_provider_configs SET enabled = false WHERE provider = 'gemini';
   ```
   Instantly halts any subsequent Google Generative Language API calls fail-closed without redeploying code.
2. **Worker Kill Switch**:
   Set `NESTEDWEB_LIVE_SCAN_WORKER_ENABLED=false` in Vercel environment variables to pause background worker claiming.
3. **Queue Health Inspection**:
   Inspect active queue depth and worker telemetry on the dedicated SaaS Admin Dashboard at `/admin`.
