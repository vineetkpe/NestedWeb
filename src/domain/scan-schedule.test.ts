import test from "node:test";
import assert from "node:assert/strict";

import {
  computeNextRunAt,
  formatCadenceLabel,
  isScheduleDue,
  isValidScanCadence,
  parseScanCadence,
  SCAN_SCHEDULE_VERSION,
  validateProjectScanSchedule,
  type ProjectScanSchedule,
  type ScanCadence,
} from "./scan-schedule.ts";

test("domain: scan-schedule exports the correct version constant", () => {
  assert.equal(SCAN_SCHEDULE_VERSION, "scan-schedule-v1");
});

test("domain: scan-schedule isValidScanCadence & parseScanCadence recognizes valid cadences", () => {
  const valid: ScanCadence[] = [
    "daily",
    "weekly",
    "biweekly",
    "monthly",
    "manual",
  ];
  for (const cadence of valid) {
    assert.equal(isValidScanCadence(cadence), true);
    assert.equal(parseScanCadence(cadence), cadence);
    assert.equal(parseScanCadence(`  ${cadence}  `), cadence);
    assert.equal(parseScanCadence(cadence.toUpperCase()), cadence);
  }
});

test("domain: scan-schedule isValidScanCadence & parseScanCadence rejects invalid values", () => {
  const invalid = [
    "hourly",
    "yearly",
    "once",
    "",
    null,
    undefined,
    123,
    {},
    [],
  ];
  for (const val of invalid) {
    assert.equal(isValidScanCadence(val), false);
    assert.equal(parseScanCadence(val), null);
  }
});

test("domain: scan-schedule computeNextRunAt returns null for manual cadence", () => {
  const baseTime = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(computeNextRunAt("manual", baseTime), null);
});

test("domain: scan-schedule computeNextRunAt computes daily (+24h)", () => {
  const baseTime = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(computeNextRunAt("daily", baseTime), "2026-10-02T12:00:00.000Z");
});

test("domain: scan-schedule computeNextRunAt computes weekly (+7 days)", () => {
  const baseTime = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(
    computeNextRunAt("weekly", baseTime),
    "2026-10-08T12:00:00.000Z",
  );
});

test("domain: scan-schedule computeNextRunAt computes biweekly (+14 days)", () => {
  const baseTime = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(
    computeNextRunAt("biweekly", baseTime),
    "2026-10-15T12:00:00.000Z",
  );
});

test("domain: scan-schedule computeNextRunAt computes monthly (+30 days)", () => {
  const baseTime = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(
    computeNextRunAt("monthly", baseTime),
    "2026-10-31T12:00:00.000Z",
  );
});

test("domain: scan-schedule computeNextRunAt accepts ISO string input and rejects invalid date", () => {
  assert.equal(
    computeNextRunAt("daily", "2026-10-01T12:00:00.000Z"),
    "2026-10-02T12:00:00.000Z",
  );
  assert.equal(computeNextRunAt("daily", "invalid-date"), null);
});

test("domain: scan-schedule isScheduleDue correctly handles due and overdue schedules", () => {
  const now = new Date("2026-10-10T12:00:00.000Z");

  const baseSchedule: ProjectScanSchedule = Object.freeze({
    projectId: "proj-1",
    workspaceId: "ws-1",
    cadence: "weekly",
    isActive: true,
    lastRunAt: "2026-10-03T12:00:00.000Z",
    nextRunAt: "2026-10-10T11:59:00.000Z", // past
  });

  assert.equal(isScheduleDue(baseSchedule, now), true);

  const exactSchedule = {
    ...baseSchedule,
    nextRunAt: "2026-10-10T12:00:00.000Z",
  };
  assert.equal(isScheduleDue(exactSchedule, now), true);

  const futureSchedule = {
    ...baseSchedule,
    nextRunAt: "2026-10-10T12:01:00.000Z",
  };
  assert.equal(isScheduleDue(futureSchedule, now), false);

  const inactiveSchedule = { ...baseSchedule, isActive: false };
  assert.equal(isScheduleDue(inactiveSchedule, now), false);

  const manualSchedule: ProjectScanSchedule = {
    ...baseSchedule,
    cadence: "manual",
    nextRunAt: null,
  };
  assert.equal(isScheduleDue(manualSchedule, now), false);

  const noNextRun: ProjectScanSchedule = { ...baseSchedule, nextRunAt: null };
  assert.equal(isScheduleDue(noNextRun, now), false);

  const invalidNextRun: ProjectScanSchedule = {
    ...baseSchedule,
    nextRunAt: "not-a-date",
  };
  assert.equal(isScheduleDue(invalidNextRun, now), false);
});

test("domain: scan-schedule validateProjectScanSchedule validates and freezes records", () => {
  const valid = {
    projectId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    cadence: "weekly",
    isActive: true,
    lastRunAt: "2026-10-01T00:00:00.000Z",
    nextRunAt: "2026-10-08T00:00:00.000Z",
  };

  const result = validateProjectScanSchedule(valid);
  assert.notEqual(result, null);
  assert.equal(result?.projectId, valid.projectId);
  assert.equal(result?.cadence, "weekly");
  assert.equal(Object.isFrozen(result), true);

  assert.equal(validateProjectScanSchedule(null), null);
  assert.equal(validateProjectScanSchedule({}), null);
  assert.equal(
    validateProjectScanSchedule({
      projectId: "p",
      workspaceId: "w",
      cadence: "invalid",
    }),
    null,
  );
  assert.equal(
    validateProjectScanSchedule({
      projectId: "",
      workspaceId: "w",
      cadence: "daily",
      isActive: true,
    }),
    null,
  );
});

test("domain: scan-schedule formatCadenceLabel returns readable agency labels", () => {
  assert.equal(formatCadenceLabel("daily"), "Daily monitoring");
  assert.equal(formatCadenceLabel("weekly"), "Weekly monitoring");
  assert.equal(formatCadenceLabel("biweekly"), "Bi-weekly monitoring");
  assert.equal(formatCadenceLabel("monthly"), "Monthly monitoring");
  assert.equal(formatCadenceLabel("manual"), "Manual on-demand only");
});
