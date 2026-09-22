import test from "node:test";
import assert from "node:assert/strict";

import {
  validateScanCompatibility,
  calculateMetricDelta,
  detectObservationShifts,
  classifyScanTrajectory,
  compareHistoricalScans,
  type MeasuredMetricDelta,
  type UnavailableMetricDelta,
  type ScanComparisonInput,
} from "./scan-comparison.ts";
import type { ScanVisibilityMetrics } from "./visibility-metrics.ts";

function createMockMeasuredMetric(value: number) {
  return {
    state: "measured" as const,
    methodVersion: "report-metrics-v1" as const,
    value,
    unit: "percentage" as const,
    numerator: Math.round(value),
    denominator: 100,
    eligibleObservationIds: ["obs-1"],
    exclusions: [],
    calculatedAt: "2026-09-20T00:00:00Z",
  };
}

function createMockMetrics(overrides: {
  mentionRate?: number;
  recommendationRate?: number;
  aiShareOfVoice?: number;
  citationShare?: number;
}): ScanVisibilityMetrics {
  return {
    methodVersion: "report-metrics-v1",
    calculatedAt: "2026-09-20T00:00:00Z",
    mentionRate: createMockMeasuredMetric(overrides.mentionRate ?? 50.0),
    recommendationRate: createMockMeasuredMetric(
      overrides.recommendationRate ?? 30.0,
    ),
    aiShareOfVoice: createMockMeasuredMetric(overrides.aiShareOfVoice ?? 40.0),
    citationShare: createMockMeasuredMetric(overrides.citationShare ?? 25.0),
    competitorGaps: [],
  };
}

test("validateScanCompatibility enforces tenant, project, and domain invariants", () => {
  const base = {
    scanId: "scan-001",
    workspaceId: "ws-100",
    projectId: "proj-200",
    trackedDomain: "acme.com",
    metricsVersion: "report-metrics-v1",
  };

  // Identical scans rejected
  const identical = validateScanCompatibility(base, { ...base });
  assert.equal(identical.ok, false);
  assert.equal(identical.code, "identical_scan_ids");

  // Mismatched workspace rejected
  const diffWs = validateScanCompatibility(base, {
    ...base,
    scanId: "scan-002",
    workspaceId: "ws-999",
  });
  assert.equal(diffWs.ok, false);
  assert.equal(diffWs.code, "mismatched_workspace");

  // Mismatched project rejected
  const diffProj = validateScanCompatibility(base, {
    ...base,
    scanId: "scan-002",
    projectId: "proj-999",
  });
  assert.equal(diffProj.ok, false);
  assert.equal(diffProj.code, "mismatched_project");

  // Mismatched domain rejected
  const diffDomain = validateScanCompatibility(base, {
    ...base,
    scanId: "scan-002",
    trackedDomain: "other.com",
  });
  assert.equal(diffDomain.ok, false);
  assert.equal(diffDomain.code, "mismatched_tracked_domain");

  // Mismatched metrics version rejected
  const diffVer = validateScanCompatibility(base, {
    ...base,
    scanId: "scan-002",
    metricsVersion: "v2-speculative",
  });
  assert.equal(diffVer.ok, false);
  assert.equal(diffVer.code, "mismatched_metrics_version");

  // Compatible pair accepted
  const compatible = validateScanCompatibility(base, {
    ...base,
    scanId: "scan-002",
  });
  assert.equal(compatible.ok, true);
});

test("calculateMetricDelta computes exact positive and negative deltas with relative change", () => {
  const baseline = createMockMeasuredMetric(40.0);
  const targetImproved = createMockMeasuredMetric(50.0);

  const improved = calculateMetricDelta(
    baseline,
    targetImproved,
  ) as MeasuredMetricDelta;
  assert.equal(improved.state, "measured");
  assert.equal(improved.delta, 10.0);
  assert.equal(improved.direction, "improved");
  assert.equal(improved.relativeChangePercent, 25.0); // (50 - 40) / 40 * 100

  const targetRegressed = createMockMeasuredMetric(30.0);
  const regressed = calculateMetricDelta(
    baseline,
    targetRegressed,
  ) as MeasuredMetricDelta;
  assert.equal(regressed.state, "measured");
  assert.equal(regressed.delta, -10.0);
  assert.equal(regressed.direction, "regressed");
  assert.equal(regressed.relativeChangePercent, -25.0);

  const targetNeutral = createMockMeasuredMetric(40.0);
  const neutral = calculateMetricDelta(
    baseline,
    targetNeutral,
  ) as MeasuredMetricDelta;
  assert.equal(neutral.state, "measured");
  assert.equal(neutral.delta, 0.0);
  assert.equal(neutral.direction, "neutral");
  assert.equal(neutral.relativeChangePercent, 0.0);
});

test("calculateMetricDelta handles unavailable states explicitly", () => {
  const measured = createMockMeasuredMetric(50.0);
  const unavailable = {
    state: "unavailable" as const,
    methodVersion: "report-metrics-v1" as const,
    reason: "no_eligible_observations" as const,
    exclusions: [],
    calculatedAt: "2026-09-20T00:00:00Z",
  };

  const baseUnavail = calculateMetricDelta(
    unavailable,
    measured,
  ) as UnavailableMetricDelta;
  assert.equal(baseUnavail.state, "unavailable");
  assert.equal(baseUnavail.reason, "baseline_unavailable");

  const targetUnavail = calculateMetricDelta(
    measured,
    unavailable,
  ) as UnavailableMetricDelta;
  assert.equal(targetUnavail.state, "unavailable");
  assert.equal(targetUnavail.reason, "target_unavailable");

  const bothUnavail = calculateMetricDelta(
    unavailable,
    unavailable,
  ) as UnavailableMetricDelta;
  assert.equal(bothUnavail.state, "unavailable");
  assert.equal(bothUnavail.reason, "both_unavailable");
});

test("detectObservationShifts maps query shifts accurately", () => {
  const baseObs = [
    {
      queryId: "q1",
      promptText: "best seo software",
      category: "comparison",
      brandMentioned: false,
      brandRecommended: false,
    },
    {
      queryId: "q2",
      promptText: "top b2b tools",
      category: "alternative",
      brandMentioned: true,
      brandRecommended: true,
    },
    {
      queryId: "q3",
      promptText: "pricing for growth",
      category: "pricing",
      brandMentioned: true,
      brandRecommended: false,
    },
  ];

  const targetObs = [
    {
      queryId: "q1",
      promptText: "best seo software",
      category: "comparison",
      brandMentioned: true,
      brandRecommended: true,
    },
    {
      queryId: "q2",
      promptText: "top b2b tools",
      category: "alternative",
      brandMentioned: false,
      brandRecommended: false,
    },
    {
      queryId: "q3",
      promptText: "pricing for growth",
      category: "pricing",
      brandMentioned: true,
      brandRecommended: false,
    },
  ];

  const shifts = detectObservationShifts(baseObs, targetObs);
  assert.equal(shifts.length, 3);

  // q1: gained mention & gained recommendation
  const q1 = shifts.find((s) => s.queryId === "q1");
  assert.ok(q1);
  assert.equal(q1.mentionShift, "gained_mention");
  assert.equal(q1.recommendationShift, "gained_recommendation");

  // q2: lost mention & lost recommendation
  const q2 = shifts.find((s) => s.queryId === "q2");
  assert.ok(q2);
  assert.equal(q2.mentionShift, "lost_mention");
  assert.equal(q2.recommendationShift, "lost_recommendation");

  // q3: retained mention
  const q3 = shifts.find((s) => s.queryId === "q3");
  assert.ok(q3);
  assert.equal(q3.mentionShift, "retained_mention");
  assert.equal(q3.recommendationShift, "remained_unrecommended");
});

test("classifyScanTrajectory determines trajectory based on metrics and query balance", () => {
  const improvedDelta = {
    state: "measured" as const,
    delta: 5.0,
    baselineValue: 40.0,
    targetValue: 45.0,
    unit: "percentage" as const,
    direction: "improved" as const,
    relativeChangePercent: 12.5,
  };
  const regressedDelta = {
    state: "measured" as const,
    delta: -5.0,
    baselineValue: 40.0,
    targetValue: 35.0,
    unit: "percentage" as const,
    direction: "regressed" as const,
    relativeChangePercent: -12.5,
  };
  const neutralDelta = {
    state: "measured" as const,
    delta: 0.0,
    baselineValue: 40.0,
    targetValue: 40.0,
    unit: "percentage" as const,
    direction: "neutral" as const,
    relativeChangePercent: 0.0,
  };

  // Pure improvement
  assert.equal(
    classifyScanTrajectory(improvedDelta, improvedDelta, neutralDelta, []),
    "improving",
  );

  // Pure regression
  assert.equal(
    classifyScanTrajectory(regressedDelta, neutralDelta, regressedDelta, []),
    "regressing",
  );

  // Mixed movements
  assert.equal(
    classifyScanTrajectory(improvedDelta, regressedDelta, neutralDelta, []),
    "mixed",
  );

  // Stable movements
  assert.equal(
    classifyScanTrajectory(neutralDelta, neutralDelta, neutralDelta, []),
    "stable",
  );
});

test("compareHistoricalScans produces complete immutable comparison report", () => {
  const baseline: ScanComparisonInput = {
    scanId: "scan-baseline-01",
    workspaceId: "ws-test-1",
    projectId: "proj-test-1",
    trackedDomain: "acme.com",
    scannedAt: "2026-09-01T12:00:00Z",
    metrics: createMockMetrics({
      mentionRate: 40.0,
      recommendationRate: 20.0,
      aiShareOfVoice: 30.0,
      citationShare: 15.0,
    }),
    queryObservations: [
      {
        queryId: "q1",
        promptText: "best crm for sales",
        category: "comparison",
        brandMentioned: false,
        brandRecommended: false,
      },
      {
        queryId: "q2",
        promptText: "top crm software",
        category: "alternative",
        brandMentioned: true,
        brandRecommended: true,
      },
    ],
  };

  const target: ScanComparisonInput = {
    scanId: "scan-target-02",
    workspaceId: "ws-test-1",
    projectId: "proj-test-1",
    trackedDomain: "acme.com",
    scannedAt: "2026-09-15T12:00:00Z",
    metrics: createMockMetrics({
      mentionRate: 60.0,
      recommendationRate: 40.0,
      aiShareOfVoice: 45.0,
      citationShare: 25.0,
    }),
    queryObservations: [
      {
        queryId: "q1",
        promptText: "best crm for sales",
        category: "comparison",
        brandMentioned: true,
        brandRecommended: true,
      },
      {
        queryId: "q2",
        promptText: "top crm software",
        category: "alternative",
        brandMentioned: true,
        brandRecommended: true,
      },
    ],
  };

  const report = compareHistoricalScans(
    baseline,
    target,
    () => "2026-09-20T12:00:00Z",
  );

  assert.equal(report.version, "scan-comparison-v1");
  assert.equal(report.comparedAt, "2026-09-20T12:00:00Z");
  assert.equal(report.metadata.baselineScanId, "scan-baseline-01");
  assert.equal(report.metadata.targetScanId, "scan-target-02");
  assert.equal(report.metadata.trackedDomain, "acme.com");
  assert.equal(report.trajectory, "improving");

  // Mention rate delta: 60.0 - 40.0 = +20.0
  assert.equal(report.mentionRateDelta.state, "measured");
  if (report.mentionRateDelta.state === "measured") {
    assert.equal(report.mentionRateDelta.delta, 20.0);
    assert.equal(report.mentionRateDelta.direction, "improved");
  }

  // Summary counts
  assert.equal(report.summary.gainedMentionsCount, 1);
  assert.equal(report.summary.lostMentionsCount, 0);
  assert.equal(report.summary.netMentionChange, 1);
  assert.equal(report.summary.gainedRecommendationsCount, 1);
  assert.equal(report.summary.lostRecommendationsCount, 0);
  assert.equal(report.summary.netRecommendationChange, 1);
});
