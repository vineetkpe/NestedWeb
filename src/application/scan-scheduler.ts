/**
 * Application service for automated recurring scan scheduling.
 * Orchestrates due schedule evaluation, quota checks, scan enqueuing,
 * and schedule timestamp advancement.
 *
 * Primary workflow: Monitor
 */

import {
  computeNextRunAt,
  isScheduleDue,
  type ProjectScanSchedule,
} from "../domain/scan-schedule.ts";

export type QuotaCheckResult =
  Readonly<{ allowed: true }> | Readonly<{ allowed: false; reason: string }>;

export type EnqueueScanResult =
  | Readonly<{ ok: true; scanId?: string }>
  | Readonly<{ ok: false; error: string }>;

export type SchedulerDependencies = Readonly<{
  checkScanQuota: (workspaceId: string) => Promise<QuotaCheckResult>;
  enqueueScan: (params: {
    projectId: string;
    workspaceId: string;
  }) => Promise<EnqueueScanResult>;
  updateScheduleTimestamps: (
    projectId: string,
    update: Readonly<{ lastRunAt: string; nextRunAt: string | null }>,
  ) => Promise<void>;
}>;

export type SchedulerEvaluationOptions = Readonly<{
  asOf?: Date | string;
}>;

export type EnqueuedScheduleRecord = Readonly<{
  projectId: string;
  workspaceId: string;
  scanId?: string | undefined;
  nextRunAt: string | null;
}>;

export type SkippedScheduleRecord = Readonly<{
  projectId: string;
  workspaceId: string;
  reason: string;
}>;

export type FailedScheduleRecord = Readonly<{
  projectId: string;
  workspaceId: string;
  error: string;
}>;

export type SchedulerEvaluationResult = Readonly<{
  evaluatedCount: number;
  dueCount: number;
  enqueuedCount: number;
  skippedQuotaCount: number;
  failedCount: number;
  enqueued: readonly EnqueuedScheduleRecord[];
  skipped: readonly SkippedScheduleRecord[];
  failed: readonly FailedScheduleRecord[];
  durationMs: number;
}>;

export async function evaluateAndEnqueueDueSchedules(
  schedules: readonly ProjectScanSchedule[],
  deps: SchedulerDependencies,
  options: SchedulerEvaluationOptions = {},
): Promise<SchedulerEvaluationResult> {
  const startTime = Date.now();
  const asOf = options.asOf
    ? typeof options.asOf === "string"
      ? new Date(options.asOf)
      : options.asOf
    : new Date();
  const asOfIso = asOf.toISOString();

  const enqueued: EnqueuedScheduleRecord[] = [];
  const skipped: SkippedScheduleRecord[] = [];
  const failed: FailedScheduleRecord[] = [];

  let dueCount = 0;

  for (const schedule of schedules) {
    if (!isScheduleDue(schedule, asOf)) {
      continue;
    }

    dueCount++;

    try {
      // 1. Enforce workspace scan quota
      const quota = await deps.checkScanQuota(schedule.workspaceId);
      if (!quota.allowed) {
        skipped.push(
          Object.freeze({
            projectId: schedule.projectId,
            workspaceId: schedule.workspaceId,
            reason: quota.reason,
          }),
        );
        continue;
      }

      // 2. Enqueue the scan
      const enqueueResult = await deps.enqueueScan({
        projectId: schedule.projectId,
        workspaceId: schedule.workspaceId,
      });

      if (!enqueueResult.ok) {
        failed.push(
          Object.freeze({
            projectId: schedule.projectId,
            workspaceId: schedule.workspaceId,
            error: enqueueResult.error,
          }),
        );
        continue;
      }

      // 3. Advance schedule nextRunAt based on cadence
      const nextRunAt = computeNextRunAt(schedule.cadence, asOf);
      await deps.updateScheduleTimestamps(schedule.projectId, {
        lastRunAt: asOfIso,
        nextRunAt,
      });

      enqueued.push(
        Object.freeze({
          projectId: schedule.projectId,
          workspaceId: schedule.workspaceId,
          ...(enqueueResult.scanId !== undefined
            ? { scanId: enqueueResult.scanId }
            : {}),
          nextRunAt,
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push(
        Object.freeze({
          projectId: schedule.projectId,
          workspaceId: schedule.workspaceId,
          error: message,
        }),
      );
    }
  }

  const durationMs = Date.now() - startTime;

  return Object.freeze({
    evaluatedCount: schedules.length,
    dueCount,
    enqueuedCount: enqueued.length,
    skippedQuotaCount: skipped.length,
    failedCount: failed.length,
    enqueued: Object.freeze(enqueued),
    skipped: Object.freeze(skipped),
    failed: Object.freeze(failed),
    durationMs,
  });
}
