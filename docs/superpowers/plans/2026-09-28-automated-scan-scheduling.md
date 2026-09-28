# Automated Scan Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automated recurring scan scheduling for agency client projects, enabling continuous AI visibility monitoring with cron triggers, quota safeguards, and UI cadence controls.

**Architecture:**

1. `src/domain/scan-schedule.ts`: Pure domain model for monitoring cadences (`weekly`, `biweekly`, `monthly`, `daily`, `manual`), schedule state validation, and next run timestamp computation.
2. `src/application/scan-scheduler.ts`: Application orchestration that evaluates due project schedules, enforces quota/usage rules, enqueues reserved scans, and advances scheduled timestamps.
3. `src/infrastructure/supabase/scan-scheduler-server.ts`: Server-only adapter interacting with Supabase to query due schedules and advance schedule records transactionally.
4. `src/app/api/worker/scheduler/route.ts`: Secure cron route handler authenticated with `CRON_SECRET`, executing scheduler runs and returning structured execution telemetry.
5. `vercel.json`: Registers `/api/worker/scheduler` cron alongside the queue worker `/api/worker/scan`.
6. `src/app/workspace/project-detail-panel.tsx`: Exposes monitoring cadence controls and next-scheduled run info in the agency dashboard.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase (PostgreSQL), Vercel Cron.

---

## Global Constraints

- Follow Ponytail: question necessity, reuse existing code, avoid generic frameworks.
- Keep raw observation, interpretation, and scheduling distinct; no fabricated timestamps or mock executions.
- Enforce authentication and authorization: `CRON_SECRET` timing-safe check for cron endpoint; member authorization for UI changes.
- Never exceed plan quotas or scan controls: fail-closed if quotas are exhausted.
- Pass `npm run verify` (lint, strict typecheck, production build, tests) and `npm audit`.

---

### Task 1: Domain Cadence & Schedule Invariants (`src/domain/scan-schedule.ts`)

**Files:**

- Create: `src/domain/scan-schedule.ts`
- Test: `src/domain/scan-schedule.test.ts`

**Interfaces:**

- Produces:
  - `type ScanCadence = "daily" | "weekly" | "biweekly" | "monthly" | "manual"`
  - `type ProjectScanSchedule`: record containing `projectId`, `workspaceId`, `cadence`, `isActive`, `lastRunAt`, `nextRunAt`
  - `computeNextRunAt(cadence: ScanCadence, fromDate?: Date): Date | null`
  - `isScheduleDue(schedule: ProjectScanSchedule, now?: Date): boolean`
  - `validateScanCadence(input: unknown): ScanCadence | null`

- [x] **Step 1: Write failing unit tests for domain schedule computations**
- [x] **Step 2: Implement pure cadence calculation and schedule validation logic**
- [x] **Step 3: Run unit tests and confirm passing**

---

### Task 2: Application Scheduler Orchestration (`src/application/scan-scheduler.ts`)

**Files:**

- Create: `src/application/scan-scheduler.ts`
- Test: `src/application/scan-scheduler.test.ts`

**Interfaces:**

- Consumes: `src/domain/scan-schedule.ts`
- Produces:
  - `evaluateAndEnqueueDueSchedules(options: SchedulerEvaluationOptions): Promise<SchedulerEvaluationResult>`
  - Evaluates due schedules against workspace quota limits
  - Enqueues bounded scan work and advances `nextRunAt`
  - Returns auditable counts: `{ evaluated, enqueued, skippedQuota, failed }`

- [x] **Step 1: Write unit tests with fake repository and quota checks**
- [x] **Step 2: Implement scheduler orchestration with fail-closed quota handling**
- [x] **Step 3: Run unit tests and confirm passing**

---

### Task 3: Server-Only Adapter & Supabase Integration (`src/infrastructure/supabase/scan-scheduler-server.ts`)

**Files:**

- Create: `src/infrastructure/supabase/scan-scheduler-server.ts`
- Test: `src/infrastructure/supabase/scan-scheduler-server.test.ts`

**Interfaces:**

- Server-only (`import "server-only"`) database adapter to query projects with active schedules and persist schedule updates.
- Reuses existing `reserve_scan_from_cohort` and project runner boundaries.

- [x] **Step 1: Write integration/unit tests for server adapter with mock Supabase client**
- [x] **Step 2: Implement query and update functions for project scan schedules**
- [x] **Step 3: Run tests and verify strict typing**

---

### Task 4: Cron Route Handler & Vercel Schedule (`/api/worker/scheduler`)

**Files:**

- Create: `src/app/api/worker/scheduler/route.ts`
- Test: `src/app/api/worker/scheduler/route.test.ts`
- Modify: `vercel.json`

**Interfaces:**

- Protected by `CRON_SECRET` timing-safe check (reusing `isWorkerAuthorized` pattern).
- Responds with structured execution audit telemetry.
- Configured in `vercel.json` crons (e.g., hourly check `0 * * * *`).

- [x] **Step 1: Write tests for cron authorization and scheduler execution dispatch**
- [x] **Step 2: Implement route handler with timing-safe auth and structured JSON response**
- [x] **Step 3: Update `vercel.json` to register the scheduler cron**
- [x] **Step 4: Run route tests and verify 200/401 handling**

---

### Task 5: UI Monitoring Cadence Controls in Agency Workspace

**Files:**

- Modify: `src/app/workspace/project-detail-panel.tsx`
- Modify: `src/app/workspace/page.tsx` (server actions for updating schedule cadence)

**Interfaces:**

- Displays current monitoring cadence (e.g. "Weekly Monitoring", "Monthly Monitoring", "Manual Only")
- Shows next scheduled scan countdown / timestamp
- Allows agency user to select and save a monitoring cadence

- [x] **Step 1: Add cadence selector & schedule display to `ProjectDetailPanel`**
- [x] **Step 2: Add interactive selection, monthly scan volume impact estimates, and next scheduled execution timestamp**
- [x] **Step 3: Verify with Playwright / UI accessibility tests**

---

### Task 6: Full Verification & Documentation

**Files:**

- Update: `.ai-context/project-checklist.md`
- Update: `.ai-context/task-history.md`
- Update: `ARCHITECTURE.md`

- [x] **Step 1: Run `npm run verify` (lint, TypeScript check, unit tests, E2E tests, production build)**
- [x] **Step 2: Run `npm audit` and ensure zero vulnerabilities**
- [x] **Step 3: Update task history and documentation**
