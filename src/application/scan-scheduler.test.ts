import test from "node:test";
import assert from "node:assert/strict";

import type { ProjectScanSchedule } from "../domain/scan-schedule.ts";
import {
  evaluateAndEnqueueDueSchedules,
  type SchedulerDependencies,
} from "./scan-scheduler.ts";

function createMockSchedule(
  projectId: string,
  workspaceId: string,
  overrides: Partial<ProjectScanSchedule> = {},
): ProjectScanSchedule {
  return Object.freeze({
    projectId,
    workspaceId,
    cadence: "weekly",
    isActive: true,
    lastRunAt: "2026-10-01T00:00:00.000Z",
    nextRunAt: "2026-10-08T00:00:00.000Z",
    ...overrides,
  });
}

test("application: scan-scheduler returns zero counts when no schedules are provided", async () => {
  const deps: SchedulerDependencies = {
    checkScanQuota: async () => ({ allowed: true }),
    enqueueScan: async () => ({ ok: true, scanId: "scan-1" }),
    updateScheduleTimestamps: async () => {},
  };

  const result = await evaluateAndEnqueueDueSchedules([], deps, {
    asOf: new Date("2026-10-08T12:00:00.000Z"),
  });

  assert.equal(result.evaluatedCount, 0);
  assert.equal(result.dueCount, 0);
  assert.equal(result.enqueuedCount, 0);
  assert.equal(result.skippedQuotaCount, 0);
  assert.equal(result.failedCount, 0);
  assert.equal(result.enqueued.length, 0);
});

test("application: scan-scheduler ignores schedules that are not due, inactive, or manual", async () => {
  const asOf = new Date("2026-10-08T12:00:00.000Z");
  const schedules: ProjectScanSchedule[] = [
    createMockSchedule("p1", "ws1", { nextRunAt: "2026-10-09T00:00:00.000Z" }), // future
    createMockSchedule("p2", "ws1", {
      isActive: false,
      nextRunAt: "2026-10-01T00:00:00.000Z",
    }), // inactive
    createMockSchedule("p3", "ws1", { cadence: "manual", nextRunAt: null }), // manual
  ];

  let enqueueCalled = false;
  const deps: SchedulerDependencies = {
    checkScanQuota: async () => ({ allowed: true }),
    enqueueScan: async () => {
      enqueueCalled = true;
      return { ok: true, scanId: "scan-1" };
    },
    updateScheduleTimestamps: async () => {},
  };

  const result = await evaluateAndEnqueueDueSchedules(schedules, deps, {
    asOf,
  });

  assert.equal(result.evaluatedCount, 3);
  assert.equal(result.dueCount, 0);
  assert.equal(result.enqueuedCount, 0);
  assert.equal(enqueueCalled, false);
});

test("application: scan-scheduler enqueues due schedules and advances nextRunAt", async () => {
  const asOf = new Date("2026-10-08T00:00:00.000Z");
  const schedules: ProjectScanSchedule[] = [
    createMockSchedule("p1", "ws1", {
      cadence: "weekly",
      nextRunAt: "2026-10-07T00:00:00.000Z",
    }),
    createMockSchedule("p2", "ws1", {
      cadence: "daily",
      nextRunAt: "2026-10-08T00:00:00.000Z",
    }),
  ];

  const updatedTimestamps: Array<{
    projectId: string;
    lastRunAt: string;
    nextRunAt: string | null;
  }> = [];
  const enqueuedScans: string[] = [];

  const deps: SchedulerDependencies = {
    checkScanQuota: async () => ({ allowed: true }),
    enqueueScan: async ({ projectId }) => {
      enqueuedScans.push(projectId);
      return { ok: true, scanId: `scan-${projectId}` };
    },
    updateScheduleTimestamps: async (projectId, update) => {
      updatedTimestamps.push({ projectId, ...update });
    },
  };

  const result = await evaluateAndEnqueueDueSchedules(schedules, deps, {
    asOf,
  });

  assert.equal(result.evaluatedCount, 2);
  assert.equal(result.dueCount, 2);
  assert.equal(result.enqueuedCount, 2);
  assert.equal(result.skippedQuotaCount, 0);
  assert.equal(result.failedCount, 0);

  assert.deepEqual(enqueuedScans, ["p1", "p2"]);
  assert.equal(updatedTimestamps.length, 2);

  // Weekly from 2026-10-08 -> 2026-10-15
  const firstUpdated = updatedTimestamps[0];
  assert.ok(firstUpdated);
  assert.equal(firstUpdated.projectId, "p1");
  assert.equal(firstUpdated.lastRunAt, asOf.toISOString());
  assert.equal(firstUpdated.nextRunAt, "2026-10-15T00:00:00.000Z");

  // Daily from 2026-10-08 -> 2026-10-09
  const secondUpdated = updatedTimestamps[1];
  assert.ok(secondUpdated);
  assert.equal(secondUpdated.projectId, "p2");
  assert.equal(secondUpdated.lastRunAt, asOf.toISOString());
  assert.equal(secondUpdated.nextRunAt, "2026-10-09T00:00:00.000Z");
});

test("application: scan-scheduler skips schedules when workspace scan quota is exhausted", async () => {
  const asOf = new Date("2026-10-08T00:00:00.000Z");
  const schedules: ProjectScanSchedule[] = [
    createMockSchedule("p1", "ws-quota-exhausted", {
      nextRunAt: "2026-10-07T00:00:00.000Z",
    }),
  ];

  let enqueueCalled = false;
  const deps: SchedulerDependencies = {
    checkScanQuota: async () => ({
      allowed: false,
      reason: "monthly_scan_quota_exhausted",
    }),
    enqueueScan: async () => {
      enqueueCalled = true;
      return { ok: true, scanId: "scan-1" };
    },
    updateScheduleTimestamps: async () => {},
  };

  const result = await evaluateAndEnqueueDueSchedules(schedules, deps, {
    asOf,
  });

  assert.equal(result.evaluatedCount, 1);
  assert.equal(result.dueCount, 1);
  assert.equal(result.enqueuedCount, 0);
  assert.equal(result.skippedQuotaCount, 1);
  assert.equal(enqueueCalled, false);
  const firstSkipped = result.skipped[0];
  assert.ok(firstSkipped);
  assert.equal(firstSkipped.reason, "monthly_scan_quota_exhausted");
});

test("application: scan-scheduler handles enqueue failure safely", async () => {
  const asOf = new Date("2026-10-08T00:00:00.000Z");
  const schedules: ProjectScanSchedule[] = [
    createMockSchedule("p1", "ws1", {
      nextRunAt: "2026-10-07T00:00:00.000Z",
    }),
  ];

  let timestampUpdated = false;
  const deps: SchedulerDependencies = {
    checkScanQuota: async () => ({ allowed: true }),
    enqueueScan: async () => ({
      ok: false,
      error: "Reservation conflict",
    }),
    updateScheduleTimestamps: async () => {
      timestampUpdated = true;
    },
  };

  const result = await evaluateAndEnqueueDueSchedules(schedules, deps, {
    asOf,
  });

  assert.equal(result.evaluatedCount, 1);
  assert.equal(result.dueCount, 1);
  assert.equal(result.enqueuedCount, 0);
  assert.equal(result.failedCount, 1);
  const firstFailed = result.failed[0];
  assert.ok(firstFailed);
  assert.equal(firstFailed.error, "Reservation conflict");
  assert.equal(timestampUpdated, false);
});
