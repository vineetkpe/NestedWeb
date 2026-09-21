import {
  calculateScanVisibilityMetrics,
  type CompetitorDefinition,
  type ObservationCitationInput,
  type ObservationCompetitorComparisonInput,
  type ObservationMentionInput,
  type ObservationRecommendationInput,
  type ObservationShareOfVoiceInput,
  type ScanVisibilityMetrics,
} from "../domain/visibility-metrics.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OBSERVATIONS = 100;
const MAX_COMPETITORS = 49;
const MAX_NAME_LENGTH = 120;

export type ObservationMentionRecord = Readonly<{
  entityId: string;
  state: "mention" | "ambiguous";
}>;

export type ObservationRecommendationRecord = Readonly<{
  entityId: string;
  state: "recommended" | "not_recommended" | "unknown";
}>;

export type ObservationIntelligenceData = Readonly<{
  observationId: string;
  isAnswered: boolean;
  normalizedCitationUrls: readonly string[];
  mentions: readonly ObservationMentionRecord[];
  recommendations: readonly ObservationRecommendationRecord[];
}>;

export type ProcessScanMetricsRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  targetEntityId: unknown;
  trackedDomain: unknown;
  competitors: unknown;
  observations: unknown;
  calculatedAt?: string | undefined;
}>;

export type ProcessScanMetricsResult =
  | Readonly<{
      ok: true;
      workspaceId: string;
      projectId: string;
      targetEntityId: string;
      trackedDomain: string;
      metrics: ScanVisibilityMetrics;
    }>
  | Readonly<{
      ok: false;
      stage: "request";
      code:
        | "invalid_workspace_id"
        | "invalid_project_id"
        | "invalid_target_entity_id"
        | "invalid_tracked_domain"
        | "invalid_competitors"
        | "invalid_observations";
    }>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function parseCompetitors(
  value: unknown,
): readonly CompetitorDefinition[] | null {
  if (!Array.isArray(value) || value.length > MAX_COMPETITORS) {
    return null;
  }
  const result: CompetitorDefinition[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const entityId = normalizeUuid((item as { entityId?: unknown }).entityId);
    const canonicalName = (item as { canonicalName?: unknown }).canonicalName;

    if (
      entityId === null ||
      seenIds.has(entityId) ||
      typeof canonicalName !== "string" ||
      canonicalName.length < 1 ||
      canonicalName.length > MAX_NAME_LENGTH ||
      canonicalName !== canonicalName.trim()
    ) {
      return null;
    }

    seenIds.add(entityId);
    result.push(Object.freeze({ entityId, canonicalName }));
  }

  return Object.freeze(result);
}

function parseObservations(
  value: unknown,
): readonly ObservationIntelligenceData[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_OBSERVATIONS
  ) {
    return null;
  }

  const result: ObservationIntelligenceData[] = [];
  const seenObservationIds = new Set<string>();

  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const rec = item as Record<string, unknown>;

    const observationId = normalizeUuid(rec.observationId);
    if (observationId === null || seenObservationIds.has(observationId)) {
      return null;
    }
    seenObservationIds.add(observationId);

    if (typeof rec.isAnswered !== "boolean") return null;
    const isAnswered = rec.isAnswered;

    if (!Array.isArray(rec.normalizedCitationUrls)) return null;
    const normalizedCitationUrls: string[] = [];
    for (const url of rec.normalizedCitationUrls) {
      if (typeof url !== "string" || url.length === 0) return null;
      normalizedCitationUrls.push(url);
    }

    if (!Array.isArray(rec.mentions)) return null;
    const mentions: ObservationMentionRecord[] = [];
    for (const m of rec.mentions) {
      if (typeof m !== "object" || m === null) return null;
      const mRec = m as Record<string, unknown>;
      const entityId = normalizeUuid(mRec.entityId);
      if (
        entityId === null ||
        (mRec.state !== "mention" && mRec.state !== "ambiguous")
      ) {
        return null;
      }
      mentions.push(Object.freeze({ entityId, state: mRec.state }));
    }

    if (!Array.isArray(rec.recommendations)) return null;
    const recommendations: ObservationRecommendationRecord[] = [];
    for (const r of rec.recommendations) {
      if (typeof r !== "object" || r === null) return null;
      const rRec = r as Record<string, unknown>;
      const entityId = normalizeUuid(rRec.entityId);
      if (
        entityId === null ||
        (rRec.state !== "recommended" &&
          rRec.state !== "not_recommended" &&
          rRec.state !== "unknown")
      ) {
        return null;
      }
      recommendations.push(Object.freeze({ entityId, state: rRec.state }));
    }

    result.push(
      Object.freeze({
        observationId,
        isAnswered,
        normalizedCitationUrls: Object.freeze(normalizedCitationUrls),
        mentions: Object.freeze(mentions),
        recommendations: Object.freeze(recommendations),
      }),
    );
  }

  return Object.freeze(result);
}

/**
 * Orchestrates pure visibility metrics calculation from structured observation intelligence.
 * Does not mutate observation records or fabricate scores.
 */
export function calculateScanMetrics(
  request: ProcessScanMetricsRequest,
): ProcessScanMetricsResult {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) {
    return Object.freeze({
      ok: false as const,
      stage: "request" as const,
      code: "invalid_workspace_id" as const,
    });
  }

  const projectId = normalizeUuid(request.projectId);
  if (projectId === null) {
    return Object.freeze({
      ok: false as const,
      stage: "request" as const,
      code: "invalid_project_id" as const,
    });
  }

  const targetEntityId = normalizeUuid(request.targetEntityId);
  if (targetEntityId === null) {
    return Object.freeze({
      ok: false as const,
      stage: "request" as const,
      code: "invalid_target_entity_id" as const,
    });
  }

  if (
    typeof request.trackedDomain !== "string" ||
    request.trackedDomain.trim().length === 0 ||
    request.trackedDomain !== request.trackedDomain.trim()
  ) {
    return Object.freeze({
      ok: false as const,
      stage: "request" as const,
      code: "invalid_tracked_domain" as const,
    });
  }
  const trackedDomain = request.trackedDomain.toLowerCase();

  const competitors = parseCompetitors(request.competitors);
  if (competitors === null) {
    return Object.freeze({
      ok: false as const,
      stage: "request" as const,
      code: "invalid_competitors" as const,
    });
  }

  const observations = parseObservations(request.observations);
  if (observations === null) {
    return Object.freeze({
      ok: false as const,
      stage: "request" as const,
      code: "invalid_observations" as const,
    });
  }

  const comparedEntityIds = new Set(competitors.map((c) => c.entityId));
  comparedEntityIds.add(targetEntityId);

  const mentionInputs: ObservationMentionInput[] = [];
  const recommendationInputs: ObservationRecommendationInput[] = [];
  const shareOfVoiceInputs: ObservationShareOfVoiceInput[] = [];
  const citationInputs: ObservationCitationInput[] = [];
  const competitorComparisonInputs: ObservationCompetitorComparisonInput[] = [];

  for (const obs of observations) {
    // 1. Mentions for target
    const targetMentions = obs.mentions.filter(
      (m) => m.entityId === targetEntityId,
    );
    let targetMentionState: ObservationMentionInput["targetMentionState"] =
      "absent";
    if (targetMentions.some((m) => m.state === "ambiguous")) {
      targetMentionState = "ambiguous";
    } else if (targetMentions.some((m) => m.state === "mention")) {
      targetMentionState = "supported";
    }

    mentionInputs.push(
      Object.freeze({
        observationId: obs.observationId,
        isAnswered: obs.isAnswered,
        targetMentionState,
      }),
    );

    // 2. Recommendations for target
    const targetRec = obs.recommendations.find(
      (r) => r.entityId === targetEntityId,
    );
    let targetRecommendationState: ObservationRecommendationInput["targetRecommendationState"] =
      "not_recommended";
    if (targetRec) {
      targetRecommendationState = targetRec.state;
    } else if (targetMentionState === "ambiguous") {
      targetRecommendationState = "unknown";
    }

    recommendationInputs.push(
      Object.freeze({
        observationId: obs.observationId,
        isAnswered: obs.isAnswered,
        targetRecommendationState,
      }),
    );

    // 3. Share of voice
    const hasAmbiguityForAnyComparedBrand = obs.mentions.some(
      (m) => comparedEntityIds.has(m.entityId) && m.state === "ambiguous",
    );
    const unambiguouslyMentionedEntityIds = Array.from(
      new Set(
        obs.mentions
          .filter(
            (m) => comparedEntityIds.has(m.entityId) && m.state === "mention",
          )
          .map((m) => m.entityId),
      ),
    );

    shareOfVoiceInputs.push(
      Object.freeze({
        observationId: obs.observationId,
        isAnswered: obs.isAnswered,
        hasAmbiguityForAnyComparedBrand,
        unambiguouslyMentionedEntityIds: Object.freeze(
          unambiguouslyMentionedEntityIds,
        ),
      }),
    );

    // 4. Citations
    citationInputs.push(
      Object.freeze({
        observationId: obs.observationId,
        normalizedCitationUrls: obs.normalizedCitationUrls,
      }),
    );

    // 5. Competitor comparisons
    const competitorRecommendationStates: Record<
      string,
      "recommended" | "not_recommended" | "unknown" | "unresolved"
    > = {};

    for (const comp of competitors) {
      const compRec = obs.recommendations.find(
        (r) => r.entityId === comp.entityId,
      );
      const compMentions = obs.mentions.filter(
        (m) => m.entityId === comp.entityId,
      );

      if (compRec) {
        competitorRecommendationStates[comp.entityId] = compRec.state;
      } else if (compMentions.some((m) => m.state === "ambiguous")) {
        competitorRecommendationStates[comp.entityId] = "unknown";
      } else {
        competitorRecommendationStates[comp.entityId] = "not_recommended";
      }
    }

    competitorComparisonInputs.push(
      Object.freeze({
        observationId: obs.observationId,
        isAnswered: obs.isAnswered,
        targetRecommendationState,
        competitorRecommendationStates: Object.freeze(
          competitorRecommendationStates,
        ),
      }),
    );
  }

  const metrics = calculateScanVisibilityMetrics({
    targetEntityId,
    trackedDomain,
    competitors,
    mentionInputs: Object.freeze(mentionInputs),
    recommendationInputs: Object.freeze(recommendationInputs),
    shareOfVoiceInputs: Object.freeze(shareOfVoiceInputs),
    citationInputs: Object.freeze(citationInputs),
    competitorComparisonInputs: Object.freeze(competitorComparisonInputs),
    calculatedAt: request.calculatedAt,
  });

  return Object.freeze({
    ok: true as const,
    workspaceId,
    projectId,
    targetEntityId,
    trackedDomain,
    metrics,
  });
}
