# Level 6: Production Hardening & Staging Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Level 6 production hardening and release readiness for AI Visibility OS: enhance health diagnostics, harden security headers and CSP, add automated deployment preflight verification, and document the staging release runbook.

**Architecture:**

1. `src/app/api/health/route.ts`: Comprehensive health diagnostic reporting database reachability, queue telemetry, and scheduler readiness with zero secret leakage.
2. `src/app/api/health/route.test.ts`: Automated tests for health probe endpoints and degraded state detection.
3. `next.config.ts`: Production security headers (CSP, Permissions-Policy, Referrer-Policy, Strict-Transport-Security) aligned with `SECURITY.md`.
4. `scripts/preflight-check.ts`: Pre-deployment environmental and cryptographic check script to validate staging/production credentials before traffic cutover.
5. `docs/staging-release-runbook.md`: Concrete release checklist and deployment procedure for Vercel + Supabase Cloud + Gemini.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Vercel.

---

## Global Constraints

- Zero secrets leaked: never expose `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `CRON_SECRET` in responses, headers, logs, or client bundles.
- Keep health probe performant and cache-controlled (`no-store, no-cache, must-revalidate`).
- Fail-closed on missing or malformed configuration.
- Full verification: `npm run verify` and `npm audit` must pass with zero errors.

---

### Task 1: Health Diagnostic & Telemetry Elevation (`/api/health`)

**Files:**

- Modify: `src/app/api/health/route.ts`
- Create: `src/app/api/health/route.test.ts`

**Interfaces:**

- Produces:
  - Structured health JSON: `{ status: "healthy" | "degraded", timestamp, uptimeSeconds, environment, services: { supabase, gemini, scheduler }, queue: { status } }`
  - Safe status codes and zero secret exposure.

- [x] **Step 1: Write unit tests for `/api/health` route handler**
- [x] **Step 2: Update `/api/health/route.ts` with telemetry checks**
- [x] **Step 3: Run health route tests and verify passing**

---

### Task 2: Production Security Headers & CSP Hardening (`next.config.ts`)

**Files:**

- Modify: `next.config.ts`

**Interfaces:**

- Configures HTTP security headers:
  - `Content-Security-Policy`: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com; frame-ancestors 'none';
  - `X-Content-Type-Options`: nosniff
  - `X-Frame-Options`: DENY
  - `Referrer-Policy`: strict-origin-when-cross-origin
  - `Permissions-Policy`: camera=(), microphone=(), geolocation=()
  - `Strict-Transport-Security`: max-age=63072000; includeSubDomains; preload

- [x] **Step 1: Update `next.config.ts` with strict security headers**
- [x] **Step 2: Verify against Playwright security header tests**

---

### Task 3: Automated Staging Preflight Audit Script (`scripts/preflight-check.ts`)

**Files:**

- Create: `scripts/preflight-check.ts`
- Modify: `package.json` (add `"preflight"` script)

**Interfaces:**

- Validates:
  - `NEXT_PUBLIC_SUPABASE_URL` is valid HTTPS origin
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` is non-empty JWT/key
  - `SUPABASE_SECRET_KEY` conforms to secret pattern
  - `GEMINI_API_KEY` conforms to key pattern
  - `CRON_SECRET` has minimum entropy (>= 16 chars)
  - Connectivity probe to Supabase and Generative Language API
- Outputs clean ASCII status table with actionable fixes.

- [x] **Step 1: Implement `scripts/preflight-check.ts`**
- [x] **Step 2: Add `"preflight": "node scripts/preflight-check.ts"` to `package.json`**
- [x] **Step 3: Execute preflight check and verify behavior**

---

### Task 4: Staging Release Runbook & DNS Documentation

**Files:**

- Create: `docs/staging-release-runbook.md`

**Interfaces:**

- Step-by-step operations guide:
  - 1. Supabase Cloud project setup & migration execution
  - 2. Vercel project deployment & environment variable binding
  - 3. Two-domain DNS configuration (`nestedweb.com` vs `app.nestedweb.com`)
  - 4. Vercel Cron verification (`/api/worker/scan` & `/api/worker/scheduler`)
  - 5. Rollback and kill-switch procedures per `OPERATIONS.md`

- [x] **Step 1: Draft comprehensive `docs/staging-release-runbook.md`**

---

### Task 5: Full Verification & Checklist Synchronization

**Files:**

- Update: `.ai-context/project-checklist.md`
- Update: `.ai-context/task-history.md`
- Update: `docs/project-progress.md`

- [x] **Step 1: Run `npm run verify`**
- [x] **Step 2: Run `npm audit`**
- [x] **Step 3: Update project checklist and task history**
