import {
  VISIBILITY_METRICS_VERSION,
  type ScanVisibilityMetrics,
  type VisibilityMetricResult,
} from "./visibility-metrics.ts";

export const SCAN_COMPARISON_VERSION = "scan-comparison-v1" as const;

export type MetricDeltaDirection = "improved" | "regressed" | "neutral";

export type MeasuredMetricDelta = Readonly<{
  state: "measured";
  delta: number;
  baselineValue: number;
  targetValue: number;
  unit: "percentage" | "percentage_points";
  direction: MetricDeltaDirection;
  relativeChangePercent: number | null;
}>;

export type UnavailableMetricDelta = Readonly<{
  state: "unavailable";
  reason: "baseline_unavailable" | "target_unavailable" | "both_unavailable";
}>;

export type MetricDeltaResult = MeasuredMetricDelta | UnavailableMetricDelta;

export type ObservationShiftType =
  | "gained_mention"
  | "lost_mention"
  | "retained_mention"
  | "remained_unmentioned";

export type RecommendationShiftType =
  | "gained_recommendation"
  | "lost_recommendation"
  | "retained_recommendation"
  | "remained_unrecommended";

export type QueryObservationShift = Readonly<{
  queryId: string;
  promptText: string;
  category: string;
  baselineMentioned: boolean;
  targetMentioned: boolean;
  baselineRecommended: boolean;
  targetRecommended: boolean;
  mentionShift: ObservationShiftType;
  recommendationShift: RecommendationShiftType;
}>;

export type ScanComparisonTrajectory =
  "improving" | "regressing" | "stable" | "mixed" | "insufficient_data";

export type ScanCompatibilityFailureCode =
  | "mismatched_workspace"
  | "mismatched_project"
  | "mismatched_tracked_domain"
  | "mismatched_metrics_version"
  | "identical_scan_ids";

export type ScanCompatibilityResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      code: ScanCompatibilityFailureCode;
      message: string;
    }>;

export type ScanComparisonInput = Readonly<{
  scanId: string;
  workspaceId: string;
  projectId: string;
  trackedDomain: string;
  scannedAt: string;
  metrics: ScanVisibilityMetrics;
  queryObservations: ReadonlyArray<{
    queryId: string;
    promptText: string;
    category: string;
    brandMentioned: boolean;
    brandRecommended: boolean;
  }>;
}>;

export type ScanComparisonReport = Readonly<{
  version: typeof SCAN_COMPARISON_VERSION;
  comparedAt: string;
  metadata: Readonly<{
    baselineScanId: string;
    targetScanId: string;
    workspaceId: string;
    projectId: string;
    trackedDomain: string;
    baselineScannedAt: string;
    targetScannedAt: string;
  }>;
  trajectory: ScanComparisonTrajectory;
  mentionRateDelta: MetricDeltaResult;
  recommendationRateDelta: MetricDeltaResult;
  aiShareOfVoiceDelta: MetricDeltaResult;
  citationShareDelta: MetricDeltaResult;
  shifts: ReadonlyArray<QueryObservationShift>;
  summary: Readonly<{
    gainedMentionsCount: number;
    lostMentionsCount: number;
    netMentionChange: number;
    gainedRecommendationsCount: number;
    lostRecommendationsCount: number;
    netRecommendationChange: number;
  }>;
}>;

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Verifies that two scans belong to the exact same tenant, project, and domain,
 * and were calculated using compatible methodology versions.
 */
export function validateScanCompatibility(
  baseline: Readonly<{
    scanId: string;
    workspaceId: string;
    projectId: string;
    trackedDomain: string;
    metricsVersion?: string;
  }>,
  target: Readonly<{
    scanId: string;
    workspaceId: string;
    projectId: string;
    trackedDomain: string;
    metricsVersion?: string;
  }>,
): ScanCompatibilityResult {
  if (baseline.scanId === target.scanId) {
    return Object.freeze({
      ok: false,
      code: "identical_scan_ids",
      message: "Cannot compare a scan against itself.",
    });
  }

  if (baseline.workspaceId !== target.workspaceId) {
    return Object.freeze({
      ok: false,
      code: "mismatched_workspace",
      message: "Scans belong to different workspaces.",
    });
  }

  if (baseline.projectId !== target.projectId) {
    return Object.freeze({
      ok: false,
      code: "mismatched_project",
      message: "Scans belong to different projects.",
    });
  }

  if (
    baseline.trackedDomain.toLowerCase().trim() !==
    target.trackedDomain.toLowerCase().trim()
  ) {
    return Object.freeze({
      ok: false,
      code: "mismatched_tracked_domain",
      message: "Scans tracked different domains.",
    });
  }

  const baselineVer = baseline.metricsVersion ?? VISIBILITY_METRICS_VERSION;
  const targetVer = target.metricsVersion ?? VISIBILITY_METRICS_VERSION;
  if (baselineVer !== targetVer || targetVer !== VISIBILITY_METRICS_VERSION) {
    return Object.freeze({
      ok: false,
      code: "mismatched_metrics_version",
      message: `Incompatible metric methodology versions (${baselineVer} vs ${targetVer}).`,
    });
  }

  return Object.freeze({ ok: true });
}

/**
 * Calculates mathematical delta between two visibility metric results.
 */
export function calculateMetricDelta(
  baseline: VisibilityMetricResult,
  target: VisibilityMetricResult,
): MetricDeltaResult {
  if (baseline.state === "unavailable" && target.state === "unavailable") {
    return Object.freeze({ state: "unavailable", reason: "both_unavailable" });
  }
  if (baseline.state === "unavailable") {
    return Object.freeze({
      state: "unavailable",
      reason: "baseline_unavailable",
    });
  }
  if (target.state === "unavailable") {
    return Object.freeze({
      state: "unavailable",
      reason: "target_unavailable",
    });
  }

  const delta = roundToOneDecimal(target.value - baseline.value);
  const direction: MetricDeltaDirection =
    delta > 0 ? "improved" : delta < 0 ? "regressed" : "neutral";

  let relativeChangePercent: number | null = null;
  if (baseline.value > 0) {
    relativeChangePercent = roundToOneDecimal(
      ((target.value - baseline.value) / baseline.value) * 100,
    );
  }

  return Object.freeze({
    state: "measured",
    delta,
    baselineValue: baseline.value,
    targetValue: target.value,
    unit: target.unit,
    direction,
    relativeChangePercent,
  });
}

/**
 * Analyzes query-level shifts between baseline and target observation sets.
 */
export function detectObservationShifts(
  baselineObservations: ScanComparisonInput["queryObservations"],
  targetObservations: ScanComparisonInput["queryObservations"],
): ReadonlyArray<QueryObservationShift> {
  const baselineMap = new Map(
    baselineObservations.map((obs) => [obs.queryId, obs]),
  );
  const targetMap = new Map(
    targetObservations.map((obs) => [obs.queryId, obs]),
  );

  const allQueryIds = Array.from(
    new Set([...baselineMap.keys(), ...targetMap.keys()]),
  ).sort();

  const shifts: QueryObservationShift[] = [];

  for (const queryId of allQueryIds) {
    const base = baselineMap.get(queryId);
    const curr = targetMap.get(queryId);

    const promptText = curr?.promptText ?? base?.promptText ?? "Unknown Query";
    const category = curr?.category ?? base?.category ?? "general";
    const baselineMentioned = base?.brandMentioned ?? false;
    const targetMentioned = curr?.brandMentioned ?? false;
    const baselineRecommended = base?.brandRecommended ?? false;
    const targetRecommended = curr?.brandRecommended ?? false;

    let mentionShift: ObservationShiftType;
    if (!baselineMentioned && targetMentioned) {
      mentionShift = "gained_mention";
    } else if (baselineMentioned && !targetMentioned) {
      mentionShift = "lost_mention";
    } else if (baselineMentioned && targetMentioned) {
      mentionShift = "retained_mention";
    } else {
      mentionShift = "remained_unmentioned";
    }

    let recommendationShift: RecommendationShiftType;
    if (!baselineRecommended && targetRecommended) {
      recommendationShift = "gained_recommendation";
    } else if (baselineRecommended && !targetRecommended) {
      recommendationShift = "lost_recommendation";
    } else if (baselineRecommended && targetRecommended) {
      recommendationShift = "retained_recommendation";
    } else {
      recommendationShift = "remained_unrecommended";
    }

    shifts.push(
      Object.freeze({
        queryId,
        promptText,
        category,
        baselineMentioned,
        targetMentioned,
        baselineRecommended,
        targetRecommended,
        mentionShift,
        recommendationShift,
      }),
    );
  }

  return Object.freeze(shifts);
}

/**
 * Classifies overall trajectory based on key deltas and query movement.
 */
export function classifyScanTrajectory(
  mentionDelta: MetricDeltaResult,
  recommendationDelta: MetricDeltaResult,
  shareOfVoiceDelta: MetricDeltaResult,
  shifts: ReadonlyArray<QueryObservationShift>,
): ScanComparisonTrajectory {
  const measuredDeltas = [
    mentionDelta,
    recommendationDelta,
    shareOfVoiceDelta,
  ].filter((d): d is MeasuredMetricDelta => d.state === "measured");

  if (measuredDeltas.length === 0 && shifts.length === 0) {
    return "insufficient_data";
  }

  const improvedCount = measuredDeltas.filter(
    (d) => d.direction === "improved",
  ).length;
  const regressedCount = measuredDeltas.filter(
    (d) => d.direction === "regressed",
  ).length;

  const gainedMentions = shifts.filter(
    (s) => s.mentionShift === "gained_mention",
  ).length;
  const lostMentions = shifts.filter(
    (s) => s.mentionShift === "lost_mention",
  ).length;

  if (
    improvedCount > 0 &&
    regressedCount === 0 &&
    gainedMentions >= lostMentions
  ) {
    return "improving";
  }

  if (
    regressedCount > 0 &&
    improvedCount === 0 &&
    lostMentions >= gainedMentions
  ) {
    return "regressing";
  }

  if (
    improvedCount === 0 &&
    regressedCount === 0 &&
    gainedMentions === 0 &&
    lostMentions === 0
  ) {
    return "stable";
  }

  if (improvedCount > 0 && regressedCount > 0) {
    return "mixed";
  }

  return gainedMentions > lostMentions
    ? "improving"
    : lostMentions > gainedMentions
      ? "regressing"
      : "stable";
}

/**
 * Compares two complete, compatible scan snapshots.
 */
export function compareHistoricalScans(
  baseline: ScanComparisonInput,
  target: ScanComparisonInput,
  now: () => string = () => new Date().toISOString(),
): ScanComparisonReport {
  const compatibility = validateScanCompatibility(
    {
      scanId: baseline.scanId,
      workspaceId: baseline.workspaceId,
      projectId: baseline.projectId,
      trackedDomain: baseline.trackedDomain,
      metricsVersion: baseline.metrics.methodVersion,
    },
    {
      scanId: target.scanId,
      workspaceId: target.workspaceId,
      projectId: target.projectId,
      trackedDomain: target.trackedDomain,
      metricsVersion: target.metrics.methodVersion,
    },
  );

  if (!compatibility.ok) {
    throw new Error(
      `Incompatible scans for comparison: ${compatibility.message}`,
    );
  }

  const mentionRateDelta = calculateMetricDelta(
    baseline.metrics.mentionRate,
    target.metrics.mentionRate,
  );
  const recommendationRateDelta = calculateMetricDelta(
    baseline.metrics.recommendationRate,
    target.metrics.recommendationRate,
  );
  const aiShareOfVoiceDelta = calculateMetricDelta(
    baseline.metrics.aiShareOfVoice,
    target.metrics.aiShareOfVoice,
  );
  const citationShareDelta = calculateMetricDelta(
    baseline.metrics.citationShare,
    target.metrics.citationShare,
  );

  const shifts = detectObservationShifts(
    baseline.queryObservations,
    target.queryObservations,
  );

  const gainedMentionsCount = shifts.filter(
    (s) => s.mentionShift === "gained_mention",
  ).length;
  const lostMentionsCount = shifts.filter(
    (s) => s.mentionShift === "lost_mention",
  ).length;
  const gainedRecommendationsCount = shifts.filter(
    (s) => s.recommendationShift === "gained_recommendation",
  ).length;
  const lostRecommendationsCount = shifts.filter(
    (s) => s.recommendationShift === "lost_recommendation",
  ).length;

  const trajectory = classifyScanTrajectory(
    mentionRateDelta,
    recommendationRateDelta,
    aiShareOfVoiceDelta,
    shifts,
  );

  return Object.freeze({
    version: SCAN_COMPARISON_VERSION,
    comparedAt: now(),
    metadata: Object.freeze({
      baselineScanId: baseline.scanId,
      targetScanId: target.scanId,
      workspaceId: baseline.workspaceId,
      projectId: baseline.projectId,
      trackedDomain: baseline.trackedDomain,
      baselineScannedAt: baseline.scannedAt,
      targetScannedAt: target.scannedAt,
    }),
    trajectory,
    mentionRateDelta,
    recommendationRateDelta,
    aiShareOfVoiceDelta,
    citationShareDelta,
    shifts,
    summary: Object.freeze({
      gainedMentionsCount,
      lostMentionsCount,
      netMentionChange: gainedMentionsCount - lostMentionsCount,
      gainedRecommendationsCount,
      lostRecommendationsCount,
      netRecommendationChange:
        gainedRecommendationsCount - lostRecommendationsCount,
    }),
  });
}
