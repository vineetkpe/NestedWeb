import {
  detectRecommendationForMention,
  RECOMMENDATION_DETECTION_VERSION,
  type RecommendationDetectionResult,
} from "../domain/recommendation-detection.ts";
import type { MentionOccurrence } from "../domain/mention-detection.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MENTION_COUNT = 2_000;
const MAX_TEXT_LENGTH = 200_000;
const MAX_ALIAS_LENGTH = 120;

export type PersistedRecommendationDetectionInput = Readonly<{
  projectId: string;
  observationId: string;
  catalogId: string;
  answerText: string | null;
  mentions: readonly MentionOccurrence[];
}>;

export type RecommendationDetectionReadGatewayResult =
  | Readonly<{ ok: true; input: PersistedRecommendationDetectionInput }>
  | Readonly<{
      ok: false;
      code: "input_not_found" | "database_error" | "invalid_database_response";
    }>;

export type RecommendationDetectionReadGateway = (
  workspaceId: string,
  observationId: string,
  catalogId: string,
) => Promise<RecommendationDetectionReadGatewayResult>;

type SuccessfulRecommendationDetection = Extract<
  RecommendationDetectionResult,
  { ok: true }
>;

export type PersistedRecommendationClassification = Readonly<{
  occurrenceOrdinal: number;
  entityId: string;
  entityKind: "company" | "product";
  aliasId: string;
  classification: SuccessfulRecommendationDetection;
}>;

export type RecommendationDetectionPersistenceGatewayResult =
  | Readonly<{
      ok: true;
      replayed: boolean;
      resultCount: number;
      recommendedCount: number;
      notRecommendedCount: number;
      unknownCount: number;
    }>
  | Readonly<{
      ok: false;
      code:
        | "input_not_found"
        | "answer_not_available"
        | "idempotency_conflict"
        | "database_error"
        | "invalid_database_response";
    }>;

export type RecommendationDetectionPersistenceGateway = (
  workspaceId: string,
  observationId: string,
  catalogId: string,
  classifications: readonly PersistedRecommendationClassification[],
) => Promise<RecommendationDetectionPersistenceGatewayResult>;

export type DetectPersistedRecommendationsRequest = Readonly<{
  workspaceId: unknown;
  observationId: unknown;
  catalogId: unknown;
}>;

export type DetectPersistedRecommendationsResult =
  | Readonly<{
      ok: true;
      projectId: string;
      observationId: string;
      catalogId: string;
      methodVersion: typeof RECOMMENDATION_DETECTION_VERSION;
      resultCount: number;
      recommendedCount: number;
      notRecommendedCount: number;
      unknownCount: number;
      replayed: boolean;
    }>
  | Readonly<{
      ok: false;
      stage: "request";
      code:
        | "invalid_workspace_id"
        | "invalid_observation_id"
        | "invalid_catalog_id";
    }>
  | Readonly<{
      ok: false;
      stage: "read";
      code: "input_not_found" | "database_error" | "invalid_database_response";
    }>
  | Readonly<{
      ok: false;
      stage: "detect";
      occurrenceOrdinal?: number;
      code: "answer_not_available" | "invalid_answer_text" | "invalid_mention";
    }>
  | Readonly<{
      ok: false;
      stage: "persist";
      code:
        | "input_not_found"
        | "answer_not_available"
        | "idempotency_conflict"
        | "database_error"
        | "invalid_database_response";
    }>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function validateMentions(
  answerText: string,
  mentions: readonly MentionOccurrence[],
): readonly MentionOccurrence[] | null {
  if (mentions.length > MAX_MENTION_COUNT) return null;

  const output: MentionOccurrence[] = [];
  const entityAliasPairs = new Set<string>();
  let previousOrdinal = -1;
  let previousEnd = -1;

  for (const mention of mentions) {
    const entityId = normalizeUuid(mention.entityId);
    const aliasId = normalizeUuid(mention.aliasId);
    if (
      mention.state !== "mention" ||
      !Number.isSafeInteger(mention.occurrenceOrdinal) ||
      mention.occurrenceOrdinal < 0 ||
      mention.occurrenceOrdinal > 1999 ||
      mention.occurrenceOrdinal <= previousOrdinal ||
      entityId === null ||
      (mention.entityKind !== "company" && mention.entityKind !== "product") ||
      aliasId === null ||
      typeof mention.aliasText !== "string" ||
      mention.aliasText.length < 1 ||
      mention.aliasText.length > MAX_ALIAS_LENGTH ||
      typeof mention.normalizedAlias !== "string" ||
      mention.normalizedAlias.length < 1 ||
      mention.normalizedAlias.length > MAX_ALIAS_LENGTH ||
      !Number.isSafeInteger(mention.source.startUtf16) ||
      !Number.isSafeInteger(mention.source.endUtf16) ||
      mention.source.startUtf16 < 0 ||
      mention.source.endUtf16 <= mention.source.startUtf16 ||
      mention.source.endUtf16 > answerText.length ||
      mention.source.startUtf16 < previousEnd ||
      typeof mention.source.text !== "string" ||
      mention.source.text !==
        answerText.slice(mention.source.startUtf16, mention.source.endUtf16)
    )
      return null;

    const pair = `${entityId}:${aliasId}:${mention.occurrenceOrdinal}`;
    if (entityAliasPairs.has(pair)) return null;
    entityAliasPairs.add(pair);
    previousOrdinal = mention.occurrenceOrdinal;
    previousEnd = mention.source.endUtf16;
    output.push(
      Object.freeze({
        occurrenceOrdinal: mention.occurrenceOrdinal,
        state: "mention",
        entityId,
        entityKind: mention.entityKind,
        aliasId,
        aliasText: mention.aliasText,
        normalizedAlias: mention.normalizedAlias,
        source: Object.freeze({
          startUtf16: mention.source.startUtf16,
          endUtf16: mention.source.endUtf16,
          text: mention.source.text,
        }),
      }),
    );
  }

  return Object.freeze(output);
}

/**
 * Classifies only persisted positive D3 mentions for one exact observation and
 * alias catalog, then persists the complete result set atomically. Unknown is
 * an explicit classification, never a fabricated negative recommendation.
 */
export async function detectPersistedRecommendations(
  request: DetectPersistedRecommendationsRequest,
  readGateway: RecommendationDetectionReadGateway,
  persistenceGateway: RecommendationDetectionPersistenceGateway,
): Promise<DetectPersistedRecommendationsResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null)
    return { ok: false, stage: "request", code: "invalid_workspace_id" };

  const observationId = normalizeUuid(request.observationId);
  if (observationId === null)
    return { ok: false, stage: "request", code: "invalid_observation_id" };

  const catalogId = normalizeUuid(request.catalogId);
  if (catalogId === null)
    return { ok: false, stage: "request", code: "invalid_catalog_id" };

  const readResult = await readGateway(workspaceId, observationId, catalogId);
  if (!readResult.ok)
    return { ok: false, stage: "read", code: readResult.code };

  const projectId = normalizeUuid(readResult.input.projectId);
  if (
    projectId === null ||
    normalizeUuid(readResult.input.observationId) !== observationId ||
    normalizeUuid(readResult.input.catalogId) !== catalogId
  )
    return { ok: false, stage: "read", code: "invalid_database_response" };

  if (readResult.input.answerText === null)
    return { ok: false, stage: "detect", code: "answer_not_available" };
  if (
    typeof readResult.input.answerText !== "string" ||
    readResult.input.answerText.length > MAX_TEXT_LENGTH ||
    !readResult.input.answerText.isWellFormed()
  )
    return { ok: false, stage: "read", code: "invalid_database_response" };

  const mentions = validateMentions(
    readResult.input.answerText,
    readResult.input.mentions,
  );
  if (mentions === null)
    return { ok: false, stage: "read", code: "invalid_database_response" };

  const classifications: PersistedRecommendationClassification[] = [];
  let recommendedCount = 0;
  let notRecommendedCount = 0;
  let unknownCount = 0;

  for (const mention of mentions) {
    const classification = detectRecommendationForMention(
      readResult.input.answerText,
      mention,
    );
    if (!classification.ok)
      return {
        ok: false,
        stage: "detect",
        occurrenceOrdinal: mention.occurrenceOrdinal,
        code: classification.code,
      };
    if (classification.occurrenceOrdinal !== mention.occurrenceOrdinal)
      return { ok: false, stage: "read", code: "invalid_database_response" };

    if (classification.state === "recommended") recommendedCount += 1;
    else if (classification.state === "not_recommended") notRecommendedCount += 1;
    else unknownCount += 1;

    classifications.push(
      Object.freeze({
        occurrenceOrdinal: mention.occurrenceOrdinal,
        entityId: mention.entityId,
        entityKind: mention.entityKind,
        aliasId: mention.aliasId,
        classification,
      }),
    );
  }

  const persistResult = await persistenceGateway(
    workspaceId,
    observationId,
    catalogId,
    Object.freeze(classifications),
  );
  if (!persistResult.ok)
    return { ok: false, stage: "persist", code: persistResult.code };

  if (
    persistResult.resultCount !== classifications.length ||
    persistResult.recommendedCount !== recommendedCount ||
    persistResult.notRecommendedCount !== notRecommendedCount ||
    persistResult.unknownCount !== unknownCount
  )
    return { ok: false, stage: "persist", code: "invalid_database_response" };

  return Object.freeze({
    ok: true,
    projectId,
    observationId,
    catalogId,
    methodVersion: RECOMMENDATION_DETECTION_VERSION,
    resultCount: classifications.length,
    recommendedCount,
    notRecommendedCount,
    unknownCount,
    replayed: persistResult.replayed,
  });
}
