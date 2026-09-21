import assert from "node:assert/strict";
import test from "node:test";

import { calculateScanMetrics } from "./scan-metrics.ts";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";
const COMP_ID = "44444444-4444-4444-8444-444444444444";
const TRACKED_DOMAIN = "acme.com";

test("rejects invalid request parameters fail-closed", () => {
  const validComp = [{ entityId: COMP_ID, canonicalName: "Beta Corp" }];
  const validObs = [
    {
      observationId: "55555555-5555-4555-8555-555555555551",
      isAnswered: true,
      normalizedCitationUrls: [],
      mentions: [],
      recommendations: [],
    },
  ];

  assert.deepEqual(
    calculateScanMetrics({
      workspaceId: "bad-id",
      projectId: PROJECT_ID,
      targetEntityId: TARGET_ID,
      trackedDomain: TRACKED_DOMAIN,
      competitors: validComp,
      observations: validObs,
    }),
    { ok: false, stage: "request", code: "invalid_workspace_id" },
  );

  assert.deepEqual(
    calculateScanMetrics({
      workspaceId: WORKSPACE_ID,
      projectId: "bad-id",
      targetEntityId: TARGET_ID,
      trackedDomain: TRACKED_DOMAIN,
      competitors: validComp,
      observations: validObs,
    }),
    { ok: false, stage: "request", code: "invalid_project_id" },
  );

  assert.deepEqual(
    calculateScanMetrics({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      targetEntityId: "bad-id",
      trackedDomain: TRACKED_DOMAIN,
      competitors: validComp,
      observations: validObs,
    }),
    { ok: false, stage: "request", code: "invalid_target_entity_id" },
  );

  assert.deepEqual(
    calculateScanMetrics({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      targetEntityId: TARGET_ID,
      trackedDomain: "   ",
      competitors: validComp,
      observations: validObs,
    }),
    { ok: false, stage: "request", code: "invalid_tracked_domain" },
  );

  assert.deepEqual(
    calculateScanMetrics({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      targetEntityId: TARGET_ID,
      trackedDomain: TRACKED_DOMAIN,
      competitors: "not-an-array",
      observations: validObs,
    }),
    { ok: false, stage: "request", code: "invalid_competitors" },
  );

  assert.deepEqual(
    calculateScanMetrics({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      targetEntityId: TARGET_ID,
      trackedDomain: TRACKED_DOMAIN,
      competitors: validComp,
      observations: [],
    }),
    { ok: false, stage: "request", code: "invalid_observations" },
  );
});

test("calculates end-to-end visibility metrics suite across observations", () => {
  const OBS_1 = "55555555-5555-4555-8555-555555555551";
  const OBS_2 = "55555555-5555-4555-8555-555555555552";
  const OBS_3 = "55555555-5555-4555-8555-555555555553";

  const result = calculateScanMetrics({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    targetEntityId: TARGET_ID,
    trackedDomain: TRACKED_DOMAIN,
    competitors: [{ entityId: COMP_ID, canonicalName: "Beta Corp" }],
    observations: [
      // obs 1: target mentioned & recommended; competitor mentioned & not recommended
      {
        observationId: OBS_1,
        isAnswered: true,
        normalizedCitationUrls: ["https://acme.com/product"],
        mentions: [
          { entityId: TARGET_ID, state: "mention" },
          { entityId: COMP_ID, state: "mention" },
        ],
        recommendations: [
          { entityId: TARGET_ID, state: "recommended" },
          { entityId: COMP_ID, state: "not_recommended" },
        ],
      },
      // obs 2: target absent; competitor mentioned & recommended
      {
        observationId: OBS_2,
        isAnswered: true,
        normalizedCitationUrls: ["https://beta.com/info"],
        mentions: [{ entityId: COMP_ID, state: "mention" }],
        recommendations: [{ entityId: COMP_ID, state: "recommended" }],
      },
      // obs 3: target mentioned & not recommended; competitor absent
      {
        observationId: OBS_3,
        isAnswered: true,
        normalizedCitationUrls: ["https://blog.acme.com/article"],
        mentions: [{ entityId: TARGET_ID, state: "mention" }],
        recommendations: [{ entityId: TARGET_ID, state: "not_recommended" }],
      },
    ],
    calculatedAt: "2026-09-21T12:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.equal(result.projectId, PROJECT_ID);
  assert.equal(result.targetEntityId, TARGET_ID);
  assert.equal(result.trackedDomain, TRACKED_DOMAIN);

  const { metrics } = result;

  // 1. Mention Rate: Target mentioned in OBS_1 and OBS_3 (2 / 3) = 66.666...%
  assert.equal(metrics.mentionRate.state, "measured");
  if (metrics.mentionRate.state === "measured") {
    assert.equal(metrics.mentionRate.numerator, 2);
    assert.equal(metrics.mentionRate.denominator, 3);
  }

  // 2. Recommendation Rate: Target recommended in OBS_1 (1 / 3) = 33.333...%
  assert.equal(metrics.recommendationRate.state, "measured");
  if (metrics.recommendationRate.state === "measured") {
    assert.equal(metrics.recommendationRate.numerator, 1);
    assert.equal(metrics.recommendationRate.denominator, 3);
  }

  // 3. AI Share of Voice: Target mentioned in OBS_1, OBS_3 (2). Competitor in OBS_1, OBS_2 (2). Total = 4. Target = 50%
  assert.equal(metrics.aiShareOfVoice.state, "measured");
  if (metrics.aiShareOfVoice.state === "measured") {
    assert.equal(metrics.aiShareOfVoice.value, 50);
    assert.equal(metrics.aiShareOfVoice.numerator, 2);
    assert.equal(metrics.aiShareOfVoice.denominator, 4);
  }

  // 4. Citation Share: acme.com/product (match), beta.com/info (no), blog.acme.com/article (match) = 2 / 3 = 66.666...%
  assert.equal(metrics.citationShare.state, "measured");
  if (metrics.citationShare.state === "measured") {
    assert.equal(metrics.citationShare.numerator, 2);
    assert.equal(metrics.citationShare.denominator, 3);
  }

  // 5. Competitor Gap: Beta vs Acme across 3 shared observations:
  // Target recommended in OBS_1 (1). Beta recommended in OBS_2 (1).
  // Gap = (1 - 1) / 3 * 100 = 0 percentage points
  assert.equal(metrics.competitorGaps.length, 1);
  const [gap] = metrics.competitorGaps;
  assert.ok(gap);
  assert.equal(gap.state, "measured");
  if (gap.state === "measured") {
    assert.equal(gap.value, 0);
    assert.equal(gap.unit, "percentage_points");
    assert.equal(gap.sharedEligibleCount, 3);
    assert.equal(gap.targetPositiveCount, 1);
    assert.equal(gap.competitorPositiveCount, 1);
  }
});
