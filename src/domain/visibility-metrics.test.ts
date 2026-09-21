import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAiShareOfVoice,
  calculateCitationShare,
  calculateCompetitorGaps,
  calculateMentionRate,
  calculateRecommendationRate,
  calculateScanVisibilityMetrics,
  matchesTrackedDomainScope,
  VISIBILITY_METRICS_VERSION,
} from "./visibility-metrics.ts";

test("matchesTrackedDomainScope correctly enforces domain boundaries and prevents spoofing", () => {
  assert.equal(
    matchesTrackedDomainScope("https://example.com/docs", "example.com"),
    true,
  );
  assert.equal(
    matchesTrackedDomainScope("https://sub.example.com/page", "example.com"),
    true,
  );
  assert.equal(
    matchesTrackedDomainScope(
      "https://nested.sub.example.com:443/a",
      "example.com",
    ),
    true,
  );

  // Suffix spoofing
  assert.equal(
    matchesTrackedDomainScope(
      "https://example.com.attacker.test/path",
      "example.com",
    ),
    false,
  );
  // Prefix spoofing
  assert.equal(
    matchesTrackedDomainScope("https://badexample.com/path", "example.com"),
    false,
  );
  // Invalid inputs
  assert.equal(matchesTrackedDomainScope("not a url", "example.com"), false);
  assert.equal(matchesTrackedDomainScope("https://example.com", ""), false);
});

test("calculateMentionRate computes accurate rate and tracks exclusions honestly", () => {
  const inputs = [
    {
      observationId: "obs-1",
      isAnswered: true,
      targetMentionState: "supported" as const,
    },
    {
      observationId: "obs-2",
      isAnswered: true,
      targetMentionState: "supported" as const,
    },
    {
      observationId: "obs-3",
      isAnswered: true,
      targetMentionState: "absent" as const,
    },
    {
      observationId: "obs-4",
      isAnswered: true,
      targetMentionState: "absent" as const,
    },
    {
      observationId: "obs-5",
      isAnswered: true,
      targetMentionState: "absent" as const,
    },
    {
      observationId: "obs-6",
      isAnswered: false,
      targetMentionState: "supported" as const,
    },
    {
      observationId: "obs-7",
      isAnswered: true,
      targetMentionState: "ambiguous" as const,
    },
    {
      observationId: "obs-8",
      isAnswered: true,
      targetMentionState: "unresolved" as const,
    },
  ];

  const result = calculateMentionRate(inputs, "2026-09-21T12:00:00.000Z");

  assert.equal(result.state, "measured");
  if (result.state === "measured") {
    assert.equal(result.methodVersion, VISIBILITY_METRICS_VERSION);
    assert.equal(result.value, 40);
    assert.equal(result.numerator, 2);
    assert.equal(result.denominator, 5);
    assert.deepEqual(result.eligibleObservationIds, [
      "obs-1",
      "obs-2",
      "obs-3",
      "obs-4",
      "obs-5",
    ]);
    assert.deepEqual(result.exclusions, [
      { observationId: "obs-6", reason: "observation_unanswered" },
      { observationId: "obs-7", reason: "mention_ambiguous" },
      { observationId: "obs-8", reason: "mention_analysis_incomplete" },
    ]);
  }

  // Zero eligible answers
  const emptyResult = calculateMentionRate([
    {
      observationId: "obs-1",
      isAnswered: false,
      targetMentionState: "supported" as const,
    },
  ]);
  assert.equal(emptyResult.state, "unavailable");
  if (emptyResult.state === "unavailable") {
    assert.equal(emptyResult.reason, "no_eligible_observations");
  }
});

test("calculateRecommendationRate computes rate over unambiguous recommendation analyses", () => {
  const inputs = [
    {
      observationId: "obs-1",
      isAnswered: true,
      targetRecommendationState: "recommended" as const,
    },
    {
      observationId: "obs-2",
      isAnswered: true,
      targetRecommendationState: "not_recommended" as const,
    },
    {
      observationId: "obs-3",
      isAnswered: true,
      targetRecommendationState: "unknown" as const,
    },
    {
      observationId: "obs-4",
      isAnswered: false,
      targetRecommendationState: "recommended" as const,
    },
  ];

  const result = calculateRecommendationRate(
    inputs,
    "2026-09-21T12:00:00.000Z",
  );

  assert.equal(result.state, "measured");
  if (result.state === "measured") {
    assert.equal(result.value, 50);
    assert.equal(result.numerator, 1);
    assert.equal(result.denominator, 2);
    assert.deepEqual(result.eligibleObservationIds, ["obs-1", "obs-2"]);
    assert.deepEqual(result.exclusions, [
      { observationId: "obs-3", reason: "recommendation_unknown" },
      { observationId: "obs-4", reason: "observation_unanswered" },
    ]);
  }
});

test("calculateAiShareOfVoice measures target share across compared brand mentions", () => {
  const targetId = "target-entity";
  const compId = "comp-entity";

  const inputs = [
    // Both target and competitor mentioned
    {
      observationId: "obs-1",
      isAnswered: true,
      hasAmbiguityForAnyComparedBrand: false,
      unambiguouslyMentionedEntityIds: [targetId, compId],
    },
    // Target only
    {
      observationId: "obs-2",
      isAnswered: true,
      hasAmbiguityForAnyComparedBrand: false,
      unambiguouslyMentionedEntityIds: [targetId],
    },
    // Competitor only
    {
      observationId: "obs-3",
      isAnswered: true,
      hasAmbiguityForAnyComparedBrand: false,
      unambiguouslyMentionedEntityIds: [compId],
    },
    // Ambiguous mention in answer -> excluded
    {
      observationId: "obs-4",
      isAnswered: true,
      hasAmbiguityForAnyComparedBrand: true,
      unambiguouslyMentionedEntityIds: [targetId],
    },
  ];

  const result = calculateAiShareOfVoice(
    inputs,
    targetId,
    [compId],
    "2026-09-21T12:00:00.000Z",
  );

  assert.equal(result.state, "measured");
  if (result.state === "measured") {
    // Target mentioned in obs-1, obs-2 (2 mentions)
    // Competitor mentioned in obs-1, obs-3 (2 mentions)
    // Total mentions = 4. Target share = 2/4 * 100 = 50%
    assert.equal(result.value, 50);
    assert.equal(result.numerator, 2);
    assert.equal(result.denominator, 4);
    assert.deepEqual(result.eligibleObservationIds, [
      "obs-1",
      "obs-2",
      "obs-3",
    ]);
  }

  // When no brand mentions exist in any eligible answer
  const noMentions = calculateAiShareOfVoice(
    [
      {
        observationId: "obs-1",
        isAnswered: true,
        hasAmbiguityForAnyComparedBrand: false,
        unambiguouslyMentionedEntityIds: [],
      },
    ],
    targetId,
    [compId],
  );
  assert.equal(noMentions.state, "unavailable");
  if (noMentions.state === "unavailable") {
    assert.equal(noMentions.reason, "no_brand_mentions");
  }
});

test("calculateCitationShare deduplicates within observation and matches domain scope", () => {
  const trackedDomain = "acme.com";
  const inputs = [
    {
      observationId: "obs-1",
      normalizedCitationUrls: [
        "https://acme.com/product",
        "https://acme.com/product", // duplicate in same obs -> counted once
        "https://blog.acme.com/news", // subdomain -> counted
        "https://competitor.com/overview",
      ],
    },
    {
      observationId: "obs-2",
      normalizedCitationUrls: [
        "https://acme.com/product", // same URL in different obs -> counted again
        "https://evil-acme.com/fake",
      ],
    },
  ];

  const result = calculateCitationShare(
    inputs,
    trackedDomain,
    "2026-09-21T12:00:00.000Z",
  );

  assert.equal(result.state, "measured");
  if (result.state === "measured") {
    // obs-1 unique: acme.com/product (match), blog.acme.com/news (match), competitor.com (no) = 3 total, 2 matches
    // obs-2 unique: acme.com/product (match), evil-acme.com (no) = 2 total, 1 match
    // Total = 5, Matching = 3. Share = 3/5 * 100 = 60%
    assert.equal(result.value, 60);
    assert.equal(result.numerator, 3);
    assert.equal(result.denominator, 5);
  }

  // Zero citations
  const empty = calculateCitationShare([], trackedDomain);
  assert.equal(empty.state, "unavailable");
  if (empty.state === "unavailable") {
    assert.equal(empty.reason, "no_eligible_citations");
  }
});

test("calculateCompetitorGaps calculates percentage points difference between competitor and target", () => {
  const competitor = {
    entityId: "comp-1",
    canonicalName: "Beta Corp",
  };

  const inputs = [
    // Both recommended
    {
      observationId: "obs-1",
      isAnswered: true,
      targetRecommendationState: "recommended" as const,
      competitorRecommendationStates: { "comp-1": "recommended" as const },
    },
    // Only competitor recommended
    {
      observationId: "obs-2",
      isAnswered: true,
      targetRecommendationState: "not_recommended" as const,
      competitorRecommendationStates: { "comp-1": "recommended" as const },
    },
    // Only competitor recommended
    {
      observationId: "obs-3",
      isAnswered: true,
      targetRecommendationState: "not_recommended" as const,
      competitorRecommendationStates: { "comp-1": "recommended" as const },
    },
    // Neither recommended
    {
      observationId: "obs-4",
      isAnswered: true,
      targetRecommendationState: "not_recommended" as const,
      competitorRecommendationStates: { "comp-1": "not_recommended" as const },
    },
    // Incomplete analysis for competitor -> excluded from shared eligible
    {
      observationId: "obs-5",
      isAnswered: true,
      targetRecommendationState: "recommended" as const,
      competitorRecommendationStates: { "comp-1": "unknown" as const },
    },
  ];

  const [gap] = calculateCompetitorGaps(
    inputs,
    [competitor],
    "2026-09-21T12:00:00.000Z",
  );
  assert.ok(gap);
  assert.equal(gap.state, "measured");
  if (gap.state === "measured") {
    // 4 shared eligible answers (obs-1, obs-2, obs-3, obs-4)
    // competitor positive = 3 (obs-1, obs-2, obs-3)
    // target positive = 1 (obs-1)
    // Gap = (3 - 1) / 4 * 100 = +50 percentage points (competitor recommended more)
    assert.equal(gap.value, 50);
    assert.equal(gap.unit, "percentage_points");
    assert.equal(gap.competitorPositiveCount, 3);
    assert.equal(gap.targetPositiveCount, 1);
    assert.equal(gap.sharedEligibleCount, 4);
    assert.deepEqual(gap.sharedObservationIds, [
      "obs-1",
      "obs-2",
      "obs-3",
      "obs-4",
    ]);
  }
});

test("calculateScanVisibilityMetrics computes the complete suite consistently", () => {
  const targetEntityId = "target-1";
  const trackedDomain = "acme.com";
  const competitors = [{ entityId: "comp-1", canonicalName: "Beta Corp" }];

  const suite = calculateScanVisibilityMetrics({
    targetEntityId,
    trackedDomain,
    competitors,
    mentionInputs: [
      {
        observationId: "obs-1",
        isAnswered: true,
        targetMentionState: "supported",
      },
    ],
    recommendationInputs: [
      {
        observationId: "obs-1",
        isAnswered: true,
        targetRecommendationState: "recommended",
      },
    ],
    shareOfVoiceInputs: [
      {
        observationId: "obs-1",
        isAnswered: true,
        hasAmbiguityForAnyComparedBrand: false,
        unambiguouslyMentionedEntityIds: [targetEntityId],
      },
    ],
    citationInputs: [
      {
        observationId: "obs-1",
        normalizedCitationUrls: ["https://acme.com"],
      },
    ],
    competitorComparisonInputs: [
      {
        observationId: "obs-1",
        isAnswered: true,
        targetRecommendationState: "recommended",
        competitorRecommendationStates: { "comp-1": "not_recommended" },
      },
    ],
    calculatedAt: "2026-09-21T12:00:00.000Z",
  });

  assert.equal(suite.methodVersion, VISIBILITY_METRICS_VERSION);
  assert.equal(suite.mentionRate.state, "measured");
  assert.equal(suite.recommendationRate.state, "measured");
  assert.equal(suite.aiShareOfVoice.state, "measured");
  assert.equal(suite.citationShare.state, "measured");
  assert.equal(suite.competitorGaps.length, 1);
  assert.equal(suite.competitorGaps[0]?.state, "measured");
});
