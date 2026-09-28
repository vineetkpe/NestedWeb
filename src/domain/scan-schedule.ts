/**
 * Pure domain model for project scan schedules.
 * Defines cadences, timing calculations, and schedule invariants.
 *
 * Primary workflow: Monitor
 * Every calculation is deterministic and purely functional.
 */

export const SCAN_SCHEDULE_VERSION = "scan-schedule-v1" as const;

export type ScanCadence =
  "daily" | "weekly" | "biweekly" | "monthly" | "manual";

export const VALID_SCAN_CADENCES: readonly ScanCadence[] = Object.freeze([
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "manual",
]);

export type ProjectScanSchedule = Readonly<{
  projectId: string;
  workspaceId: string;
  cadence: ScanCadence;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}>;

export function isValidScanCadence(value: unknown): value is ScanCadence {
  return (
    typeof value === "string" &&
    VALID_SCAN_CADENCES.includes(value.toLowerCase() as ScanCadence)
  );
}

export function parseScanCadence(value: unknown): ScanCadence | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (isValidScanCadence(trimmed)) {
    return trimmed;
  }
  return null;
}

const CADENCE_INTERVAL_MS: Readonly<
  Record<Exclude<ScanCadence, "manual">, number>
> = Object.freeze({
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  biweekly: 14 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
});

/**
 * Computes the next scheduled execution timestamp as an ISO-8601 string.
 * Returns null if cadence is "manual" or if fromDate is invalid.
 */
export function computeNextRunAt(
  cadence: ScanCadence,
  fromDate: Date | string = new Date(),
): string | null {
  if (cadence === "manual") return null;

  const baseDate = typeof fromDate === "string" ? new Date(fromDate) : fromDate;
  const baseTime = baseDate.getTime();
  if (Number.isNaN(baseTime)) return null;

  const interval = CADENCE_INTERVAL_MS[cadence];
  if (!interval) return null;

  return new Date(baseTime + interval).toISOString();
}

/**
 * Determines whether a schedule is currently due for execution.
 * Inactive schedules, manual cadences, or schedules with future nextRunAt are not due.
 */
export function isScheduleDue(
  schedule: ProjectScanSchedule,
  asOf: Date | string = new Date(),
): boolean {
  if (
    !schedule.isActive ||
    schedule.cadence === "manual" ||
    !schedule.nextRunAt
  ) {
    return false;
  }

  const nextRunTime = new Date(schedule.nextRunAt).getTime();
  if (Number.isNaN(nextRunTime)) {
    return false;
  }

  const asOfTime =
    typeof asOf === "string" ? new Date(asOf).getTime() : asOf.getTime();
  if (Number.isNaN(asOfTime)) {
    return false;
  }

  return nextRunTime <= asOfTime;
}

/**
 * Validates and freezes an untrusted value as a ProjectScanSchedule.
 */
export function validateProjectScanSchedule(
  value: unknown,
): ProjectScanSchedule | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.projectId !== "string" ||
    candidate.projectId.trim().length === 0
  ) {
    return null;
  }

  if (
    typeof candidate.workspaceId !== "string" ||
    candidate.workspaceId.trim().length === 0
  ) {
    return null;
  }

  const cadence = parseScanCadence(candidate.cadence);
  if (!cadence) return null;

  if (typeof candidate.isActive !== "boolean") return null;

  let lastRunAt: string | null = null;
  if (candidate.lastRunAt !== null && candidate.lastRunAt !== undefined) {
    if (typeof candidate.lastRunAt !== "string") return null;
    const time = new Date(candidate.lastRunAt).getTime();
    if (Number.isNaN(time)) return null;
    lastRunAt = candidate.lastRunAt;
  }

  let nextRunAt: string | null = null;
  if (candidate.nextRunAt !== null && candidate.nextRunAt !== undefined) {
    if (typeof candidate.nextRunAt !== "string") return null;
    const time = new Date(candidate.nextRunAt).getTime();
    if (Number.isNaN(time)) return null;
    nextRunAt = candidate.nextRunAt;
  }

  return Object.freeze({
    projectId: candidate.projectId.trim(),
    workspaceId: candidate.workspaceId.trim(),
    cadence,
    isActive: candidate.isActive,
    lastRunAt,
    nextRunAt,
  });
}

/**
 * Returns a human-readable agency label for a given cadence.
 */
export function formatCadenceLabel(cadence: ScanCadence): string {
  switch (cadence) {
    case "daily":
      return "Daily monitoring";
    case "weekly":
      return "Weekly monitoring";
    case "biweekly":
      return "Bi-weekly monitoring";
    case "monthly":
      return "Monthly monitoring";
    case "manual":
      return "Manual on-demand only";
  }
}
