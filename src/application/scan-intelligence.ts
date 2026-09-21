import type { MentionOccurrence } from "../domain/mention-detection.ts";
import {
  detectRecommendationForMention,
  type RecommendationDetectionResult,
} from "../domain/recommendation-detection.ts";
import {
  normalizePersistedCitations,
  type CitationNormalizationPersistenceGateway,
  type CitationNormalizationReadGateway,
  type NormalizePersistedCitationsRequest,
  type NormalizePersistedCitationsResult,
} from "./citation-normalization-persistence.ts";
import {
  detectPersistedMentions,
  type DetectPersistedMentionsRequest,
  type DetectPersistedMentionsResult,
  type MentionDetectionPersistenceGateway,
  type MentionDetectionReadGateway,
} from "./mention-detection-persistence.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SCAN_OBSERVATIONS = 100;

export type ObservationIntelligenceResult = Readonly<{
  observationId: string;
  citations: NormalizePersistedCitationsResult;
  mentions: DetectPersistedMentionsResult;
}>;

export type ScanIntelligenceTotals = Readonly<{
  citationCount: number;
  normalizedCitationCount: number;
  excludedCitationCount: number;
  replayedCitationCount: number;
  occurrenceCount: number;
  mentionCount: number;
  ambiguousCount: number;
}>;

export type ProcessScanIntelligenceRequest = Readonly<{
  workspaceId: unknown;
  catalogId: unknown;
  observationIds: unknown;
}>;

export type ProcessScanIntelligenceResult =
  | Readonly<{
      ok: true;
      workspaceId: string;
      catalogId: string;
      observationCount: number;
      successfulObservations: number;
      failedObservations: number;
      observations: readonly ObservationIntelligenceResult[];
      totals: ScanIntelligenceTotals;
    }>
  | Readonly<{
      ok: false;
      stage: "request";
      code:
        | "invalid_workspace_id"
        | "invalid_catalog_id"
        | "invalid_observation_ids";
    }>;

export type ScanIntelligenceDependencies = Readonly<{
  normalizeCitations: (
    request: NormalizePersistedCitationsRequest,
  ) => Promise<NormalizePersistedCitationsResult>;
  detectMentions: (
    request: DetectPersistedMentionsRequest,
  ) => Promise<DetectPersistedMentionsResult>;
}>;

export type EvaluatedMentionRecommendation = Readonly<{
  occurrenceOrdinal: number;
  entityId: string;
  aliasText: string;
  recommendation: RecommendationDetectionResult;
}>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function parseObservationIds(value: unknown): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_SCAN_OBSERVATIONS
  ) {
    return null;
  }
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const id = normalizeUuid(item);
    if (id === null) return null;
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
  }
  return Object.freeze(unique);
}

/**
 * Creates runner dependencies from standard citation and mention gateways.
 */
export function createScanIntelligenceRunners(
  citationReadGateway: CitationNormalizationReadGateway,
  citationPersistenceGateway: CitationNormalizationPersistenceGateway,
  mentionReadGateway: MentionDetectionReadGateway,
  mentionPersistenceGateway: MentionDetectionPersistenceGateway,
): ScanIntelligenceDependencies {
  return Object.freeze({
    normalizeCitations: (req) =>
      normalizePersistedCitations(
        req,
        citationReadGateway,
        citationPersistenceGateway,
      ),
    detectMentions: (req) =>
      detectPersistedMentions(
        req,
        mentionReadGateway,
        mentionPersistenceGateway,
      ),
  });
}

/**
 * Pure helper to evaluate recommendation state on detected positive mentions.
 * Preserves evidence spans and never fabricates customer outcomes or metrics.
 */
export function evaluateMentionRecommendations(
  answerText: unknown,
  mentions: readonly MentionOccurrence[],
): readonly EvaluatedMentionRecommendation[] {
  const evaluated: EvaluatedMentionRecommendation[] = [];
  for (const mention of mentions) {
    const recommendation = detectRecommendationForMention(answerText, mention);
    evaluated.push(
      Object.freeze({
        occurrenceOrdinal: mention.occurrenceOrdinal,
        entityId: mention.entityId,
        aliasText: mention.aliasText,
        recommendation,
      }),
    );
  }
  return Object.freeze(evaluated);
}

/**
 * Orchestrates Level 3 Intelligence across all observation evidence gathered
 * during a bounded scan. Raw observation text and citations remain the immutable
 * source of truth; derived normalization and span mentions are persisted
 * idempotently without corrupting or overwriting underlying evidence.
 */
export async function processScanIntelligence(
  request: ProcessScanIntelligenceRequest,
  dependencies: ScanIntelligenceDependencies,
): Promise<ProcessScanIntelligenceResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) {
    return Object.freeze({
      ok: false as const,
      stage: "request" as const,
      code: "invalid_workspace_id" as const,
    });
  }

  const catalogId = normalizeUuid(request.catalogId);
  if (catalogId === null) {
    return Object.freeze({
      ok: false as const,
      stage: "request" as const,
      code: "invalid_catalog_id" as const,
    });
  }

  const observationIds = parseObservationIds(request.observationIds);
  if (observationIds === null) {
    return Object.freeze({
      ok: false as const,
      stage: "request" as const,
      code: "invalid_observation_ids" as const,
    });
  }

  const observations: ObservationIntelligenceResult[] = [];
  let successfulObservations = 0;
  let failedObservations = 0;

  let totalCitationCount = 0;
  let totalNormalizedCitationCount = 0;
  let totalExcludedCitationCount = 0;
  let totalReplayedCitationCount = 0;
  let totalOccurrenceCount = 0;
  let totalMentionCount = 0;
  let totalAmbiguousCount = 0;

  for (const observationId of observationIds) {
    const citations = await dependencies.normalizeCitations({
      workspaceId,
      observationId,
    });

    const mentions = await dependencies.detectMentions({
      workspaceId,
      observationId,
      catalogId,
    });

    const observationOk = citations.ok && mentions.ok;
    if (observationOk) {
      successfulObservations += 1;
    } else {
      failedObservations += 1;
    }

    if (citations.ok) {
      totalCitationCount += citations.citationCount;
      totalNormalizedCitationCount += citations.normalizedCount;
      totalExcludedCitationCount += citations.excludedCount;
      totalReplayedCitationCount += citations.replayedCount;
    }

    if (mentions.ok) {
      totalOccurrenceCount += mentions.occurrenceCount;
      totalMentionCount += mentions.mentionCount;
      totalAmbiguousCount += mentions.ambiguousCount;
    }

    observations.push(
      Object.freeze({
        observationId,
        citations,
        mentions,
      }),
    );
  }

  return Object.freeze({
    ok: true as const,
    workspaceId,
    catalogId,
    observationCount: observationIds.length,
    successfulObservations,
    failedObservations,
    observations: Object.freeze(observations),
    totals: Object.freeze({
      citationCount: totalCitationCount,
      normalizedCitationCount: totalNormalizedCitationCount,
      excludedCitationCount: totalExcludedCitationCount,
      replayedCitationCount: totalReplayedCitationCount,
      occurrenceCount: totalOccurrenceCount,
      mentionCount: totalMentionCount,
      ambiguousCount: totalAmbiguousCount,
    }),
  });
}
