import "server-only";

import {
  detectPersistedMentions,
  type DetectPersistedMentionsRequest,
  type DetectPersistedMentionsResult,
  type MentionDetectionCatalogProjection,
  type MentionDetectionPersistenceGateway,
  type MentionDetectionPersistenceGatewayResult,
  type MentionDetectionReadGateway,
  type MentionDetectionReadGatewayResult,
  type PersistedMentionDetectionInput,
} from "../application/mention-detection-persistence.ts";
import type { MentionDetectionResult } from "../domain/mention-detection.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ENTITY_COUNT = 50;
const MAX_ALIASES_PER_ENTITY = 20;
const MAX_TOTAL_ALIAS_COUNT = 200;
const MAX_NAME_LENGTH = 120;

export type SupabaseMentionDetectionRpcName =
  | "read_mention_detection_input"
  | "persist_mention_detection";

export type SupabaseMentionDetectionRpc = (
  name: SupabaseMentionDetectionRpcName,
  args: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

type SuccessfulMentionDetection = Extract<MentionDetectionResult, { ok: true }>;

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

function validBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maxLength &&
    value.isWellFormed()
  );
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

function parseCatalog(
  value: unknown,
  expectedCatalogId: string,
): MentionDetectionCatalogProjection | null {
  if (
    !record(value) ||
    !hasExactKeys(value, ["catalogId", "methodVersion", "entities"]) ||
    !validUuid(value.catalogId) ||
    value.catalogId.toLowerCase() !== expectedCatalogId ||
    value.methodVersion !== "entity-alias-v1" ||
    !Array.isArray(value.entities) ||
    value.entities.length < 1 ||
    value.entities.length > MAX_ENTITY_COUNT
  )
    return null;

  const entities: MentionDetectionCatalogProjection["entities"][number][] = [];
  const entityIds = new Set<string>();
  const aliasIds = new Set<string>();
  let aliasCount = 0;
  let companyCount = 0;

  for (const [entityOrdinal, entity] of value.entities.entries()) {
    if (
      !record(entity) ||
      !hasExactKeys(entity, [
        "entityId",
        "entityOrdinal",
        "entityKind",
        "canonicalName",
        "aliases",
      ]) ||
      !validUuid(entity.entityId) ||
      entity.entityOrdinal !== entityOrdinal ||
      (entity.entityKind !== "company" && entity.entityKind !== "product") ||
      !validBoundedString(entity.canonicalName, MAX_NAME_LENGTH) ||
      entity.canonicalName !== entity.canonicalName.trim() ||
      !Array.isArray(entity.aliases) ||
      entity.aliases.length < 1 ||
      entity.aliases.length > MAX_ALIASES_PER_ENTITY
    )
      return null;

    const entityId = entity.entityId.toLowerCase();
    if (entityIds.has(entityId)) return null;
    entityIds.add(entityId);
    if (entity.entityKind === "company") companyCount += 1;

    const aliases: MentionDetectionCatalogProjection["entities"][number]["aliases"][number][] =
      [];
    for (const [aliasOrdinal, alias] of entity.aliases.entries()) {
      aliasCount += 1;
      if (aliasCount > MAX_TOTAL_ALIAS_COUNT) return null;
      if (
        !record(alias) ||
        !hasExactKeys(alias, [
          "aliasId",
          "aliasOrdinal",
          "aliasText",
          "normalizedAlias",
          "matchState",
        ]) ||
        !validUuid(alias.aliasId) ||
        alias.aliasOrdinal !== aliasOrdinal ||
        !validBoundedString(alias.aliasText, MAX_NAME_LENGTH) ||
        !validBoundedString(alias.normalizedAlias, MAX_NAME_LENGTH) ||
        (alias.matchState !== "eligible" && alias.matchState !== "ambiguous")
      )
        return null;

      const aliasId = alias.aliasId.toLowerCase();
      if (aliasIds.has(aliasId)) return null;
      aliasIds.add(aliasId);
      aliases.push(
        Object.freeze({
          aliasId,
          aliasOrdinal,
          aliasText: alias.aliasText,
          normalizedAlias: alias.normalizedAlias,
          matchState: alias.matchState,
        }),
      );
    }

    entities.push(
      Object.freeze({
        entityId,
        entityOrdinal,
        entityKind: entity.entityKind,
        canonicalName: entity.canonicalName,
        aliases: Object.freeze(aliases),
      }),
    );
  }

  if (companyCount !== 1 || aliasCount < 1) return null;
  return Object.freeze({
    catalogId: expectedCatalogId,
    methodVersion: "entity-alias-v1",
    entities: Object.freeze(entities),
  });
}

function parseReadInput(
  value: unknown,
  observationId: string,
  catalogId: string,
): PersistedMentionDetectionInput | null {
  if (
    !record(value) ||
    !hasExactKeys(value, ["projectId", "observationId", "answerText", "catalog"]) ||
    !validUuid(value.projectId) ||
    !validUuid(value.observationId) ||
    value.observationId.toLowerCase() !== observationId ||
    (value.answerText !== null &&
      (typeof value.answerText !== "string" || !value.answerText.isWellFormed()))
  )
    return null;

  const catalog = parseCatalog(value.catalog, catalogId);
  if (catalog === null) return null;
  return Object.freeze({
    projectId: value.projectId.toLowerCase(),
    observationId,
    answerText: value.answerText,
    catalog,
  });
}

async function readMentionDetectionInput(
  workspaceId: string,
  observationId: string,
  catalogId: string,
  rpc: SupabaseMentionDetectionRpc,
): Promise<MentionDetectionReadGatewayResult> {
  let response: unknown;
  try {
    response = await rpc("read_mention_detection_input", {
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
      envelope.error.message === "Mention detection input not found"
    )
      return { ok: false, code: "input_not_found" };
    return { ok: false, code: "database_error" };
  }

  const input = parseReadInput(envelope.data, observationId, catalogId);
  if (input === null)
    return { ok: false, code: "invalid_database_response" };
  return { ok: true, input };
}

function mapPersistenceError(
  error: Record<string, unknown> | null,
): MentionDetectionPersistenceGatewayResult {
  if (
    error?.code === "P0001" &&
    error.message === "Mention detection input not found"
  )
    return { ok: false, code: "input_not_found" };
  if (
    error?.code === "P0001" &&
    error.message === "Mention detection answer unavailable"
  )
    return { ok: false, code: "answer_not_available" };
  if (
    error?.code === "22023" &&
    error.message === "Mention detection replay conflicts with stored evidence"
  )
    return { ok: false, code: "idempotency_conflict" };
  return { ok: false, code: "database_error" };
}

async function persistMentionDetection(
  workspaceId: string,
  observationId: string,
  catalogId: string,
  detection: SuccessfulMentionDetection,
  rpc: SupabaseMentionDetectionRpc,
): Promise<MentionDetectionPersistenceGatewayResult> {
  let response: unknown;
  try {
    response = await rpc("persist_mention_detection", {
      p_workspace_id: workspaceId,
      p_observation_id: observationId,
      p_catalog_id: catalogId,
      p_detection: detection,
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
      "occurrenceCount",
      "mentionCount",
      "ambiguousCount",
      "replayed",
    ]) ||
    data.observationId !== observationId ||
    data.catalogId !== catalogId ||
    data.methodVersion !== detection.methodVersion ||
    !Number.isSafeInteger(data.occurrenceCount) ||
    !Number.isSafeInteger(data.mentionCount) ||
    !Number.isSafeInteger(data.ambiguousCount) ||
    typeof data.replayed !== "boolean"
  )
    return { ok: false, code: "invalid_database_response" };

  return Object.freeze({
    ok: true,
    replayed: data.replayed,
    occurrenceCount: data.occurrenceCount as number,
    mentionCount: data.mentionCount as number,
    ambiguousCount: data.ambiguousCount as number,
  });
}

/** Server-only D3b composition over the two narrow service RPCs. */
export function executeSupabaseMentionDetection(
  request: DetectPersistedMentionsRequest,
  rpc: SupabaseMentionDetectionRpc,
): Promise<DetectPersistedMentionsResult> {
  const readGateway: MentionDetectionReadGateway = (
    workspaceId,
    observationId,
    catalogId,
  ) =>
    readMentionDetectionInput(
      workspaceId,
      observationId,
      catalogId,
      rpc,
    );
  const persistenceGateway: MentionDetectionPersistenceGateway = (
    workspaceId,
    observationId,
    catalogId,
    detection,
  ) =>
    persistMentionDetection(
      workspaceId,
      observationId,
      catalogId,
      detection,
      rpc,
    );

  return detectPersistedMentions(request, readGateway, persistenceGateway);
}
