import "server-only";

import {
  detectPersistedRecommendations,
  type DetectPersistedRecommendationsRequest,
  type DetectPersistedRecommendationsResult,
  type PersistedRecommendationClassification,
  type PersistedRecommendationDetectionInput,
  type RecommendationDetectionPersistenceGateway,
  type RecommendationDetectionPersistenceGatewayResult,
  type RecommendationDetectionReadGateway,
  type RecommendationDetectionReadGatewayResult,
} from "../application/recommendation-detection-persistence.ts";
import type { MentionOccurrence } from "../domain/mention-detection.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MENTION_COUNT = 2_000;
const MAX_TEXT_LENGTH = 200_000;
const MAX_ALIAS_LENGTH = 120;

export type SupabaseRecommendationDetectionRpcName =
  | "read_recommendation_detection_input"
  | "persist_recommendation_detection";

export type SupabaseRecommendationDetectionRpc = (
  name: SupabaseRecommendationDetectionRpcName,
  args: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function parseEnvelope(value: unknown):
  | Readonly<{ ok: true; data: unknown }>
  | Readonly<{
      ok: false;
      error: Record<string, unknown> | null;
      invalid: boolean;
    }> {
  if (
    !record(value) ||
    !Object.hasOwn(value, "data") ||
    !Object.hasOwn(value, "error")
  )
    return { ok: false, error: null, invalid: true };

  if (value.error !== null && value.error !== undefined)
    return {
      ok: false,
      error: record(value.error) ? value.error : null,
      invalid: false,
    };

  return { ok: true, data: value.data };
}

function parseMention(value: unknown): MentionOccurrence | null {
  if (
    !record(value) ||
    !hasExactKeys(value, [
      "occurrenceOrdinal",
      "state",
      "entityId",
      "entityKind",
      "aliasId",
      "aliasText",
      "normalizedAlias",
      "source",
    ]) ||
    !Number.isSafeInteger(value.occurrenceOrdinal) ||
    (value.occurrenceOrdinal as number) < 0 ||
    (value.occurrenceOrdinal as number) > 1999 ||
    value.state !== "mention" ||
    !validUuid(value.entityId) ||
    (value.entityKind !== "company" && value.entityKind !== "product") ||
    !validUuid(value.aliasId) ||
    typeof value.aliasText !== "string" ||
    value.aliasText.length < 1 ||
    value.aliasText.length > MAX_ALIAS_LENGTH ||
    !value.aliasText.isWellFormed() ||
    typeof value.normalizedAlias !== "string" ||
    value.normalizedAlias.length < 1 ||
    value.normalizedAlias.length > MAX_ALIAS_LENGTH ||
    !value.normalizedAlias.isWellFormed() ||
    !record(value.source) ||
    !hasExactKeys(value.source, ["startUtf16", "endUtf16", "text"]) ||
    !Number.isSafeInteger(value.source.startUtf16) ||
    !Number.isSafeInteger(value.source.endUtf16) ||
    typeof value.source.text !== "string" ||
    !value.source.text.isWellFormed()
  )
    return null;

  return Object.freeze({
    occurrenceOrdinal: value.occurrenceOrdinal as number,
    state: "mention",
    entityId: value.entityId.toLowerCase(),
    entityKind: value.entityKind,
    aliasId: value.aliasId.toLowerCase(),
    aliasText: value.aliasText,
    normalizedAlias: value.normalizedAlias,
    source: Object.freeze({
      startUtf16: value.source.startUtf16 as number,
      endUtf16: value.source.endUtf16 as number,
      text: value.source.text,
    }),
  });
}

function parseReadInput(
  value: unknown,
  observationId: string,
  catalogId: string,
): PersistedRecommendationDetectionInput | null {
  if (
    !record(value) ||
    !hasExactKeys(value, [
      "projectId",
      "observationId",
      "catalogId",
      "answerText",
      "mentions",
    ]) ||
    !validUuid(value.projectId) ||
    !validUuid(value.observationId) ||
    value.observationId.toLowerCase() !== observationId ||
    !validUuid(value.catalogId) ||
    value.catalogId.toLowerCase() !== catalogId ||
    (value.answerText !== null &&
      (typeof value.answerText !== "string" ||
        value.answerText.length > MAX_TEXT_LENGTH ||
        !value.answerText.isWellFormed())) ||
    !Array.isArray(value.mentions) ||
    value.mentions.length > MAX_MENTION_COUNT
  )
    return null;

  const mentions: MentionOccurrence[] = [];
  for (const rawMention of value.mentions) {
    const mention = parseMention(rawMention);
    if (mention === null) return null;
    mentions.push(mention);
  }

  return Object.freeze({
    projectId: value.projectId.toLowerCase(),
    observationId,
    catalogId,
    answerText: value.answerText,
    mentions: Object.freeze(mentions),
  });
}

async function readRecommendationInput(
  workspaceId: string,
  observationId: string,
  catalogId: string,
  rpc: SupabaseRecommendationDetectionRpc,
): Promise<RecommendationDetectionReadGatewayResult> {
  let response: unknown;
  try {
    response = await rpc("read_recommendation_detection_input", {
      p_workspace_id: workspaceId,
      p_observation_id: observationId,
      p_catalog_id: catalogId,
    });
  } catch {
    return { ok: false, code: "database_error" };
  }

  const envelope = parseEnvelope(response);
  if (!envelope.ok) {
    if (envelope.invalid)
      return { ok: false, code: "invalid_database_response" };
    if (
      envelope.error?.code === "P0001" &&
      envelope.error.message === "Recommendation detection input not found"
    )
      return { ok: false, code: "input_not_found" };
    return { ok: false, code: "database_error" };
  }

  const input = parseReadInput(envelope.data, observationId, catalogId);
  if (input === null) return { ok: false, code: "invalid_database_response" };
  return { ok: true, input };
}

function persistencePayload(
  classifications: readonly PersistedRecommendationClassification[],
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    methodVersion: "recommendation-detection-v1",
    mentionMethodVersion: "mention-detection-v1",
    results: classifications.map((entry) => ({
      occurrenceOrdinal: entry.occurrenceOrdinal,
      state: entry.classification.state,
      evidence: entry.classification.evidence,
    })),
  });
}

function mapPersistenceError(
  error: Record<string, unknown> | null,
): RecommendationDetectionPersistenceGatewayResult {
  if (
    error?.code === "P0001" &&
    error.message === "Recommendation detection input not found"
  )
    return { ok: false, code: "input_not_found" };
  if (
    error?.code === "P0001" &&
    error.message === "Recommendation detection answer unavailable"
  )
    return { ok: false, code: "answer_not_available" };
  if (
    error?.code === "22023" &&
    error.message ===
      "Recommendation detection replay conflicts with stored evidence"
  )
    return { ok: false, code: "idempotency_conflict" };
  return { ok: false, code: "database_error" };
}

async function persistRecommendationDetection(
  workspaceId: string,
  observationId: string,
  catalogId: string,
  classifications: readonly PersistedRecommendationClassification[],
  rpc: SupabaseRecommendationDetectionRpc,
): Promise<RecommendationDetectionPersistenceGatewayResult> {
  let response: unknown;
  try {
    response = await rpc("persist_recommendation_detection", {
      p_workspace_id: workspaceId,
      p_observation_id: observationId,
      p_catalog_id: catalogId,
      p_detection: persistencePayload(classifications),
    });
  } catch {
    return { ok: false, code: "database_error" };
  }

  const envelope = parseEnvelope(response);
  if (!envelope.ok) {
    if (envelope.invalid)
      return { ok: false, code: "invalid_database_response" };
    return mapPersistenceError(envelope.error);
  }

  const data = envelope.data;
  if (
    !record(data) ||
    !hasExactKeys(data, [
      "observationId",
      "catalogId",
      "methodVersion",
      "resultCount",
      "recommendedCount",
      "notRecommendedCount",
      "unknownCount",
      "replayed",
    ]) ||
    data.observationId !== observationId ||
    data.catalogId !== catalogId ||
    data.methodVersion !== "recommendation-detection-v1" ||
    !Number.isSafeInteger(data.resultCount) ||
    !Number.isSafeInteger(data.recommendedCount) ||
    !Number.isSafeInteger(data.notRecommendedCount) ||
    !Number.isSafeInteger(data.unknownCount) ||
    typeof data.replayed !== "boolean"
  )
    return { ok: false, code: "invalid_database_response" };

  return Object.freeze({
    ok: true,
    replayed: data.replayed,
    resultCount: data.resultCount as number,
    recommendedCount: data.recommendedCount as number,
    notRecommendedCount: data.notRecommendedCount as number,
    unknownCount: data.unknownCount as number,
  });
}

/** Server-only D4b composition over two narrow service RPCs. */
export function executeSupabaseRecommendationDetection(
  request: DetectPersistedRecommendationsRequest,
  rpc: SupabaseRecommendationDetectionRpc,
): Promise<DetectPersistedRecommendationsResult> {
  const readGateway: RecommendationDetectionReadGateway = (
    workspaceId,
    observationId,
    catalogId,
  ) => readRecommendationInput(workspaceId, observationId, catalogId, rpc);
  const persistenceGateway: RecommendationDetectionPersistenceGateway = (
    workspaceId,
    observationId,
    catalogId,
    classifications,
  ) =>
    persistRecommendationDetection(
      workspaceId,
      observationId,
      catalogId,
      classifications,
      rpc,
    );

  return detectPersistedRecommendations(request, readGateway, persistenceGateway);
}
