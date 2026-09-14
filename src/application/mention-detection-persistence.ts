import {
  detectEntityMentions,
  MENTION_DETECTION_VERSION,
  type MentionDetectionResult,
} from "../domain/mention-detection.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MentionDetectionCatalogProjection = Readonly<{
  catalogId: string;
  methodVersion: "entity-alias-v1";
  entities: readonly Readonly<{
    entityId: string;
    entityOrdinal: number;
    entityKind: "company" | "product";
    canonicalName: string;
    aliases: readonly Readonly<{
      aliasId: string;
      aliasOrdinal: number;
      aliasText: string;
      normalizedAlias: string;
      matchState: "eligible" | "ambiguous";
    }>[];
  }>[];
}>;

export type PersistedMentionDetectionInput = Readonly<{
  projectId: string;
  observationId: string;
  answerText: string | null;
  catalog: MentionDetectionCatalogProjection;
}>;

export type MentionDetectionReadGatewayResult =
  | Readonly<{ ok: true; input: PersistedMentionDetectionInput }>
  | Readonly<{
      ok: false;
      code: "input_not_found" | "database_error" | "invalid_database_response";
    }>;

export type MentionDetectionReadGateway = (
  workspaceId: string,
  observationId: string,
  catalogId: string,
) => Promise<MentionDetectionReadGatewayResult>;

type SuccessfulMentionDetection = Extract<MentionDetectionResult, { ok: true }>;

export type MentionDetectionPersistenceGatewayResult =
  | Readonly<{
      ok: true;
      replayed: boolean;
      occurrenceCount: number;
      mentionCount: number;
      ambiguousCount: number;
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

export type MentionDetectionPersistenceGateway = (
  workspaceId: string,
  observationId: string,
  catalogId: string,
  detection: SuccessfulMentionDetection,
) => Promise<MentionDetectionPersistenceGatewayResult>;

export type DetectPersistedMentionsRequest = Readonly<{
  workspaceId: unknown;
  observationId: unknown;
  catalogId: unknown;
}>;

export type DetectPersistedMentionsResult =
  | Readonly<{
      ok: true;
      projectId: string;
      observationId: string;
      catalogId: string;
      methodVersion: typeof MENTION_DETECTION_VERSION;
      occurrenceCount: number;
      mentionCount: number;
      ambiguousCount: number;
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
      code:
        | "answer_not_available"
        | "invalid_answer_text"
        | "invalid_catalog"
        | "normalization_unmappable"
        | "occurrence_limit_exceeded";
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

/**
 * Runs D3a only over immutable persisted inputs, then appends the exact derived
 * evidence through a persistence gateway. This use case does not infer
 * recommendation, sentiment, competitor status, or citation support.
 */
export async function detectPersistedMentions(
  request: DetectPersistedMentionsRequest,
  readGateway: MentionDetectionReadGateway,
  persistenceGateway: MentionDetectionPersistenceGateway,
): Promise<DetectPersistedMentionsResult> {
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
    normalizeUuid(readResult.input.catalog.catalogId) !== catalogId
  )
    return { ok: false, stage: "read", code: "invalid_database_response" };

  if (readResult.input.answerText === null)
    return { ok: false, stage: "detect", code: "answer_not_available" };

  const detection = detectEntityMentions(
    readResult.input.answerText,
    readResult.input.catalog,
  );
  if (!detection.ok)
    return { ok: false, stage: "detect", code: detection.code };
  if (detection.catalogId !== catalogId)
    return { ok: false, stage: "read", code: "invalid_database_response" };

  let mentionCount = 0;
  let ambiguousCount = 0;
  for (const occurrence of detection.occurrences) {
    if (occurrence.state === "mention") mentionCount += 1;
    else ambiguousCount += 1;
  }

  const persistResult = await persistenceGateway(
    workspaceId,
    observationId,
    catalogId,
    detection,
  );
  if (!persistResult.ok)
    return { ok: false, stage: "persist", code: persistResult.code };

  if (
    persistResult.occurrenceCount !== detection.occurrences.length ||
    persistResult.mentionCount !== mentionCount ||
    persistResult.ambiguousCount !== ambiguousCount
  )
    return {
      ok: false,
      stage: "persist",
      code: "invalid_database_response",
    };

  return Object.freeze({
    ok: true,
    projectId,
    observationId,
    catalogId,
    methodVersion: detection.methodVersion,
    occurrenceCount: detection.occurrences.length,
    mentionCount,
    ambiguousCount,
    replayed: persistResult.replayed,
  });
}
