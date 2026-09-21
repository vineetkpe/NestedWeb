export const VISIBILITY_METRICS_VERSION = "report-metrics-v1" as const;

export type MetricUnit = "percentage" | "percentage_points";

export type MetricExclusionReason =
  | "observation_unanswered"
  | "mention_analysis_incomplete"
  | "mention_ambiguous"
  | "recommendation_analysis_incomplete"
  | "recommendation_unknown"
  | "citation_extraction_incomplete"
  | "invalid_url";

export type MetricExclusion = Readonly<{
  observationId: string;
  reason: MetricExclusionReason;
}>;

export type MeasuredMetricValue = Readonly<{
  state: "measured";
  methodVersion: typeof VISIBILITY_METRICS_VERSION;
  value: number;
  unit: MetricUnit;
  numerator: number;
  denominator: number;
  eligibleObservationIds: readonly string[];
  exclusions: readonly MetricExclusion[];
  calculatedAt: string;
}>;

export type UnavailableMetricValue = Readonly<{
  state: "unavailable";
  methodVersion: typeof VISIBILITY_METRICS_VERSION;
  reason:
    "no_eligible_observations" | "no_brand_mentions" | "no_eligible_citations";
  exclusions: readonly MetricExclusion[];
  calculatedAt: string;
}>;

export type VisibilityMetricResult =
  MeasuredMetricValue | UnavailableMetricValue;

export type CompetitorGapMetric =
  | Readonly<{
      state: "measured";
      methodVersion: typeof VISIBILITY_METRICS_VERSION;
      competitorEntityId: string;
      competitorName: string;
      value: number;
      unit: "percentage_points";
      targetPositiveCount: number;
      competitorPositiveCount: number;
      sharedEligibleCount: number;
      sharedObservationIds: readonly string[];
      calculatedAt: string;
    }>
  | Readonly<{
      state: "unavailable";
      methodVersion: typeof VISIBILITY_METRICS_VERSION;
      competitorEntityId: string;
      competitorName: string;
      reason: "no_shared_observations";
      calculatedAt: string;
    }>;

export type ScanVisibilityMetrics = Readonly<{
  methodVersion: typeof VISIBILITY_METRICS_VERSION;
  calculatedAt: string;
  mentionRate: VisibilityMetricResult;
  recommendationRate: VisibilityMetricResult;
  aiShareOfVoice: VisibilityMetricResult;
  citationShare: VisibilityMetricResult;
  competitorGaps: readonly CompetitorGapMetric[];
}>;

export type ObservationMentionInput = Readonly<{
  observationId: string;
  isAnswered: boolean;
  targetMentionState: "supported" | "absent" | "ambiguous" | "unresolved";
}>;

export type ObservationRecommendationInput = Readonly<{
  observationId: string;
  isAnswered: boolean;
  targetRecommendationState:
    "recommended" | "not_recommended" | "unknown" | "unresolved";
}>;

export type ObservationShareOfVoiceInput = Readonly<{
  observationId: string;
  isAnswered: boolean;
  hasAmbiguityForAnyComparedBrand: boolean;
  unambiguouslyMentionedEntityIds: readonly string[];
}>;

export type ObservationCitationInput = Readonly<{
  observationId: string;
  normalizedCitationUrls: readonly string[];
}>;

export type CompetitorDefinition = Readonly<{
  entityId: string;
  canonicalName: string;
}>;

export type ObservationCompetitorComparisonInput = Readonly<{
  observationId: string;
  isAnswered: boolean;
  targetRecommendationState:
    "recommended" | "not_recommended" | "unknown" | "unresolved";
  competitorRecommendationStates: Readonly<
    Record<string, "recommended" | "not_recommended" | "unknown" | "unresolved">
  >;
}>;

function calculateTimestamp(customTimestamp?: string): string {
  if (customTimestamp && customTimestamp.length > 0) {
    return customTimestamp;
  }
  return new Date().toISOString();
}

/**
 * Validates whether a URL strictly belongs to a target domain or its subdomains.
 * Defends against prefix/suffix spoofing (e.g. example.com.evil.com or badexample.com).
 */
export function matchesTrackedDomainScope(
  urlStr: string,
  trackedDomain: string,
): boolean {
  if (typeof urlStr !== "string" || typeof trackedDomain !== "string") {
    return false;
  }
  const cleanTracked = trackedDomain.trim().toLowerCase();
  if (cleanTracked.length === 0) return false;

  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    return host === cleanTracked || host.endsWith(`.${cleanTracked}`);
  } catch {
    return false;
  }
}

/**
 * Mention Rate = 100 * (eligible answers with a supported target mention)
 *              / (answers with completed, unambiguous target mention analysis)
 * Target brand counts at most once per answer.
 */
export function calculateMentionRate(
  inputs: readonly ObservationMentionInput[],
  calculatedAt?: string,
): VisibilityMetricResult {
  const timestamp = calculateTimestamp(calculatedAt);
  const eligibleIds: string[] = [];
  const exclusions: MetricExclusion[] = [];
  let supportedCount = 0;

  for (const input of inputs) {
    if (!input.isAnswered) {
      exclusions.push({
        observationId: input.observationId,
        reason: "observation_unanswered",
      });
      continue;
    }

    if (input.targetMentionState === "unresolved") {
      exclusions.push({
        observationId: input.observationId,
        reason: "mention_analysis_incomplete",
      });
      continue;
    }

    if (input.targetMentionState === "ambiguous") {
      exclusions.push({
        observationId: input.observationId,
        reason: "mention_ambiguous",
      });
      continue;
    }

    eligibleIds.push(input.observationId);
    if (input.targetMentionState === "supported") {
      supportedCount += 1;
    }
  }

  if (eligibleIds.length === 0) {
    return Object.freeze({
      state: "unavailable" as const,
      methodVersion: VISIBILITY_METRICS_VERSION,
      reason: "no_eligible_observations" as const,
      exclusions: Object.freeze(exclusions),
      calculatedAt: timestamp,
    });
  }

  const value = (supportedCount / eligibleIds.length) * 100;
  return Object.freeze({
    state: "measured" as const,
    methodVersion: VISIBILITY_METRICS_VERSION,
    value,
    unit: "percentage" as const,
    numerator: supportedCount,
    denominator: eligibleIds.length,
    eligibleObservationIds: Object.freeze(eligibleIds),
    exclusions: Object.freeze(exclusions),
    calculatedAt: timestamp,
  });
}

/**
 * Recommendation Rate = 100 * (eligible answers with a supported positive target recommendation)
 *                     / (answers with completed, unambiguous target recommendation analysis)
 */
export function calculateRecommendationRate(
  inputs: readonly ObservationRecommendationInput[],
  calculatedAt?: string,
): VisibilityMetricResult {
  const timestamp = calculateTimestamp(calculatedAt);
  const eligibleIds: string[] = [];
  const exclusions: MetricExclusion[] = [];
  let recommendedCount = 0;

  for (const input of inputs) {
    if (!input.isAnswered) {
      exclusions.push({
        observationId: input.observationId,
        reason: "observation_unanswered",
      });
      continue;
    }

    if (input.targetRecommendationState === "unresolved") {
      exclusions.push({
        observationId: input.observationId,
        reason: "recommendation_analysis_incomplete",
      });
      continue;
    }

    if (input.targetRecommendationState === "unknown") {
      exclusions.push({
        observationId: input.observationId,
        reason: "recommendation_unknown",
      });
      continue;
    }

    eligibleIds.push(input.observationId);
    if (input.targetRecommendationState === "recommended") {
      recommendedCount += 1;
    }
  }

  if (eligibleIds.length === 0) {
    return Object.freeze({
      state: "unavailable" as const,
      methodVersion: VISIBILITY_METRICS_VERSION,
      reason: "no_eligible_observations" as const,
      exclusions: Object.freeze(exclusions),
      calculatedAt: timestamp,
    });
  }

  const value = (recommendedCount / eligibleIds.length) * 100;
  return Object.freeze({
    state: "measured" as const,
    methodVersion: VISIBILITY_METRICS_VERSION,
    value,
    unit: "percentage" as const,
    numerator: recommendedCount,
    denominator: eligibleIds.length,
    eligibleObservationIds: Object.freeze(eligibleIds),
    exclusions: Object.freeze(exclusions),
    calculatedAt: timestamp,
  });
}

/**
 * AI Share of Voice = 100 * (target answer-level mentions)
 *                   / (sum of answer-level mentions for all brands in frozen target+competitor set)
 * Across answers with completed unambiguous analysis for every compared brand.
 */
export function calculateAiShareOfVoice(
  inputs: readonly ObservationShareOfVoiceInput[],
  targetEntityId: string,
  comparedEntityIds: readonly string[],
  calculatedAt?: string,
): VisibilityMetricResult {
  const timestamp = calculateTimestamp(calculatedAt);
  const eligibleIds: string[] = [];
  const exclusions: MetricExclusion[] = [];
  const comparedSet = new Set(comparedEntityIds);
  comparedSet.add(targetEntityId);

  let targetMentionCount = 0;
  let totalMentionsCount = 0;

  for (const input of inputs) {
    if (!input.isAnswered) {
      exclusions.push({
        observationId: input.observationId,
        reason: "observation_unanswered",
      });
      continue;
    }

    if (input.hasAmbiguityForAnyComparedBrand) {
      exclusions.push({
        observationId: input.observationId,
        reason: "mention_ambiguous",
      });
      continue;
    }

    eligibleIds.push(input.observationId);

    // Each brand counts at most once per answer
    const mentionedSet = new Set(input.unambiguouslyMentionedEntityIds);
    if (mentionedSet.has(targetEntityId)) {
      targetMentionCount += 1;
    }

    for (const entityId of comparedSet) {
      if (mentionedSet.has(entityId)) {
        totalMentionsCount += 1;
      }
    }
  }

  if (eligibleIds.length === 0) {
    return Object.freeze({
      state: "unavailable" as const,
      methodVersion: VISIBILITY_METRICS_VERSION,
      reason: "no_eligible_observations" as const,
      exclusions: Object.freeze(exclusions),
      calculatedAt: timestamp,
    });
  }

  if (totalMentionsCount === 0) {
    return Object.freeze({
      state: "unavailable" as const,
      methodVersion: VISIBILITY_METRICS_VERSION,
      reason: "no_brand_mentions" as const,
      exclusions: Object.freeze(exclusions),
      calculatedAt: timestamp,
    });
  }

  const value = (targetMentionCount / totalMentionsCount) * 100;
  return Object.freeze({
    state: "measured" as const,
    methodVersion: VISIBILITY_METRICS_VERSION,
    value,
    unit: "percentage" as const,
    numerator: targetMentionCount,
    denominator: totalMentionsCount,
    eligibleObservationIds: Object.freeze(eligibleIds),
    exclusions: Object.freeze(exclusions),
    calculatedAt: timestamp,
  });
}

/**
 * Citation Share = 100 * (eligible cited URLs matching tracked company domain scope)
 *                / (all eligible cited URLs, deduplicated by normalized URL within each observation)
 */
export function calculateCitationShare(
  inputs: readonly ObservationCitationInput[],
  trackedDomain: string,
  calculatedAt?: string,
): VisibilityMetricResult {
  const timestamp = calculateTimestamp(calculatedAt);
  const eligibleIds: string[] = [];
  const exclusions: MetricExclusion[] = [];
  let matchingCitations = 0;
  let totalCitations = 0;

  for (const input of inputs) {
    // Deduplicate within this observation
    const uniqueUrls = Array.from(new Set(input.normalizedCitationUrls));
    if (uniqueUrls.length > 0) {
      eligibleIds.push(input.observationId);
    }

    for (const url of uniqueUrls) {
      totalCitations += 1;
      if (matchesTrackedDomainScope(url, trackedDomain)) {
        matchingCitations += 1;
      }
    }
  }

  if (totalCitations === 0) {
    return Object.freeze({
      state: "unavailable" as const,
      methodVersion: VISIBILITY_METRICS_VERSION,
      reason: "no_eligible_citations" as const,
      exclusions: Object.freeze(exclusions),
      calculatedAt: timestamp,
    });
  }

  const value = (matchingCitations / totalCitations) * 100;
  return Object.freeze({
    state: "measured" as const,
    methodVersion: VISIBILITY_METRICS_VERSION,
    value,
    unit: "percentage" as const,
    numerator: matchingCitations,
    denominator: totalCitations,
    eligibleObservationIds: Object.freeze(eligibleIds),
    exclusions: Object.freeze(exclusions),
    calculatedAt: timestamp,
  });
}

/**
 * Competitor Gap = For each named competitor:
 * 100 * (competitor-positive answers - target-positive answers) / shared eligible answers
 * Unit: percentage points. Positive indicates competitor recommended more often.
 */
export function calculateCompetitorGaps(
  inputs: readonly ObservationCompetitorComparisonInput[],
  competitors: readonly CompetitorDefinition[],
  calculatedAt?: string,
): readonly CompetitorGapMetric[] {
  const timestamp = calculateTimestamp(calculatedAt);
  const results: CompetitorGapMetric[] = [];

  for (const competitor of competitors) {
    const sharedIds: string[] = [];
    let targetPositive = 0;
    let competitorPositive = 0;

    for (const input of inputs) {
      if (!input.isAnswered) continue;

      const targetState = input.targetRecommendationState;
      const compState =
        input.competitorRecommendationStates[competitor.entityId];

      // Requires completed unambiguous recommendation analysis for both
      const isTargetValid =
        targetState === "recommended" || targetState === "not_recommended";
      const isCompValid =
        compState === "recommended" || compState === "not_recommended";

      if (isTargetValid && isCompValid) {
        sharedIds.push(input.observationId);
        if (targetState === "recommended") targetPositive += 1;
        if (compState === "recommended") competitorPositive += 1;
      }
    }

    if (sharedIds.length === 0) {
      results.push(
        Object.freeze({
          state: "unavailable" as const,
          methodVersion: VISIBILITY_METRICS_VERSION,
          competitorEntityId: competitor.entityId,
          competitorName: competitor.canonicalName,
          reason: "no_shared_observations" as const,
          calculatedAt: timestamp,
        }),
      );
      continue;
    }

    const value =
      ((competitorPositive - targetPositive) / sharedIds.length) * 100;
    results.push(
      Object.freeze({
        state: "measured" as const,
        methodVersion: VISIBILITY_METRICS_VERSION,
        competitorEntityId: competitor.entityId,
        competitorName: competitor.canonicalName,
        value,
        unit: "percentage_points" as const,
        targetPositiveCount: targetPositive,
        competitorPositiveCount: competitorPositive,
        sharedEligibleCount: sharedIds.length,
        sharedObservationIds: Object.freeze(sharedIds),
        calculatedAt: timestamp,
      }),
    );
  }

  return Object.freeze(results);
}

export type CalculateScanVisibilityMetricsParams = Readonly<{
  targetEntityId: string;
  trackedDomain: string;
  competitors: readonly CompetitorDefinition[];
  mentionInputs: readonly ObservationMentionInput[];
  recommendationInputs: readonly ObservationRecommendationInput[];
  shareOfVoiceInputs: readonly ObservationShareOfVoiceInput[];
  citationInputs: readonly ObservationCitationInput[];
  competitorComparisonInputs: readonly ObservationCompetitorComparisonInput[];
  calculatedAt?: string | undefined;
}>;

/**
 * Calculates the complete auditable suite of visibility metrics for a scan cohort.
 */
export function calculateScanVisibilityMetrics(
  params: CalculateScanVisibilityMetricsParams,
): ScanVisibilityMetrics {
  const timestamp = calculateTimestamp(params.calculatedAt);
  const comparedEntityIds = params.competitors.map((c) => c.entityId);

  const mentionRate = calculateMentionRate(params.mentionInputs, timestamp);
  const recommendationRate = calculateRecommendationRate(
    params.recommendationInputs,
    timestamp,
  );
  const aiShareOfVoice = calculateAiShareOfVoice(
    params.shareOfVoiceInputs,
    params.targetEntityId,
    comparedEntityIds,
    timestamp,
  );
  const citationShare = calculateCitationShare(
    params.citationInputs,
    params.trackedDomain,
    timestamp,
  );
  const competitorGaps = calculateCompetitorGaps(
    params.competitorComparisonInputs,
    params.competitors,
    timestamp,
  );

  return Object.freeze({
    methodVersion: VISIBILITY_METRICS_VERSION,
    calculatedAt: timestamp,
    mentionRate,
    recommendationRate,
    aiShareOfVoice,
    citationShare,
    competitorGaps,
  });
}
