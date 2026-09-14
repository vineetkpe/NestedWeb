import "server-only";

import {
  persistEntityAliasCatalog,
  type EntityAliasCatalogPersistenceGateway,
  type EntityAliasCatalogPersistenceGatewayResult,
  type PersistEntityAliasCatalogRequest,
  type PersistEntityAliasCatalogResult,
  type PersistedEntityAlias,
  type PersistedEntityAliasCatalog,
  type PersistedEntityAliasEntity,
  type ValidatedEntityAliasCatalogPersistenceRequest,
} from "../application/entity-alias-persistence.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type SupabaseEntityAliasRpc = (
  name: "persist_entity_alias_catalog",
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

function rpcPayload(
  request: ValidatedEntityAliasCatalogPersistenceRequest,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    methodVersion: request.catalog.methodVersion,
    entities: request.catalog.entities.map((entity) => ({
      entityKind: entity.entityKind,
      canonicalName: entity.canonicalName,
      aliases: entity.aliases.map((alias) => ({
        aliasText: alias.aliasText,
        normalizedAlias: alias.normalizedAlias,
        matchState: alias.matchState,
      })),
    })),
  });
}

function parseAlias(
  value: unknown,
  expected: ValidatedEntityAliasCatalogPersistenceRequest["catalog"]["entities"][number]["aliases"][number],
): PersistedEntityAlias | null {
  if (
    !record(value) ||
    !hasExactKeys(value, [
      "aliasId",
      "aliasOrdinal",
      "aliasText",
      "normalizedAlias",
      "matchState",
    ]) ||
    typeof value.aliasId !== "string" ||
    !UUID_PATTERN.test(value.aliasId) ||
    value.aliasOrdinal !== expected.aliasOrdinal ||
    value.aliasText !== expected.aliasText ||
    value.normalizedAlias !== expected.normalizedAlias ||
    value.matchState !== expected.matchState
  )
    return null;

  return Object.freeze({
    aliasId: value.aliasId.toLowerCase(),
    aliasOrdinal: expected.aliasOrdinal,
    aliasText: expected.aliasText,
    normalizedAlias: expected.normalizedAlias,
    matchState: expected.matchState,
  });
}

function parseEntity(
  value: unknown,
  expected: ValidatedEntityAliasCatalogPersistenceRequest["catalog"]["entities"][number],
): PersistedEntityAliasEntity | null {
  if (
    !record(value) ||
    !hasExactKeys(value, [
      "entityId",
      "entityOrdinal",
      "entityKind",
      "canonicalName",
      "aliases",
    ]) ||
    typeof value.entityId !== "string" ||
    !UUID_PATTERN.test(value.entityId) ||
    value.entityOrdinal !== expected.entityOrdinal ||
    value.entityKind !== expected.entityKind ||
    value.canonicalName !== expected.canonicalName ||
    !Array.isArray(value.aliases) ||
    value.aliases.length !== expected.aliases.length
  )
    return null;

  const aliases: PersistedEntityAlias[] = [];
  const aliasIds = new Set<string>();
  for (const [index, expectedAlias] of expected.aliases.entries()) {
    const alias = parseAlias(value.aliases[index], expectedAlias);
    if (alias === null || aliasIds.has(alias.aliasId)) return null;
    aliasIds.add(alias.aliasId);
    aliases.push(alias);
  }

  return Object.freeze({
    entityId: value.entityId.toLowerCase(),
    entityOrdinal: expected.entityOrdinal,
    entityKind: expected.entityKind,
    canonicalName: expected.canonicalName,
    aliases: Object.freeze(aliases),
  });
}

function parseCatalog(
  value: unknown,
  request: ValidatedEntityAliasCatalogPersistenceRequest,
): PersistedEntityAliasCatalog | null {
  if (
    !record(value) ||
    !hasExactKeys(value, [
      "catalogId",
      "methodVersion",
      "requestFingerprint",
      "entityCount",
      "aliasCount",
      "replayed",
      "entities",
    ]) ||
    typeof value.catalogId !== "string" ||
    !UUID_PATTERN.test(value.catalogId) ||
    value.methodVersion !== request.catalog.methodVersion ||
    typeof value.requestFingerprint !== "string" ||
    !SHA256_PATTERN.test(value.requestFingerprint) ||
    value.entityCount !== request.catalog.entities.length ||
    value.aliasCount !== request.catalog.aliasCount ||
    typeof value.replayed !== "boolean" ||
    !Array.isArray(value.entities) ||
    value.entities.length !== request.catalog.entities.length
  )
    return null;

  const entities: PersistedEntityAliasEntity[] = [];
  const entityIds = new Set<string>();
  const aliasIds = new Set<string>();
  for (const [index, expectedEntity] of request.catalog.entities.entries()) {
    const entity = parseEntity(value.entities[index], expectedEntity);
    if (entity === null || entityIds.has(entity.entityId)) return null;
    entityIds.add(entity.entityId);
    for (const alias of entity.aliases) {
      if (aliasIds.has(alias.aliasId)) return null;
      aliasIds.add(alias.aliasId);
    }
    entities.push(entity);
  }

  return Object.freeze({
    catalogId: value.catalogId.toLowerCase(),
    methodVersion: request.catalog.methodVersion,
    requestFingerprint: value.requestFingerprint,
    entityCount: request.catalog.entities.length,
    aliasCount: request.catalog.aliasCount,
    replayed: value.replayed,
    entities: Object.freeze(entities),
  });
}

function mapRpcError(
  error: Record<string, unknown> | null,
): EntityAliasCatalogPersistenceGatewayResult {
  if (error?.code === "42501" && error.message === "Project access denied")
    return { ok: false, code: "project_access_denied" };
  if (
    error?.code === "22023" &&
    error.message === "Entity alias catalog idempotency conflict"
  )
    return { ok: false, code: "idempotency_conflict" };
  return { ok: false, code: "database_error" };
}

async function persistThroughRpc(
  request: ValidatedEntityAliasCatalogPersistenceRequest,
  rpc: SupabaseEntityAliasRpc,
): Promise<EntityAliasCatalogPersistenceGatewayResult> {
  let response: unknown;
  try {
    response = await rpc("persist_entity_alias_catalog", {
      p_workspace_id: request.workspaceId,
      p_project_id: request.projectId,
      p_idempotency_key: request.idempotencyKey,
      p_catalog: rpcPayload(request),
    });
  } catch {
    return { ok: false, code: "database_error" };
  }

  const envelope = parseEnvelope(response);
  if (!envelope.ok) {
    if (envelope.invalid)
      return { ok: false, code: "invalid_database_response" };
    return mapRpcError(envelope.error);
  }

  const catalog = parseCatalog(envelope.data, request);
  if (catalog === null)
    return { ok: false, code: "invalid_database_response" };

  return { ok: true, catalog };
}

export function executeSupabaseEntityAliasPersistence(
  request: PersistEntityAliasCatalogRequest,
  rpc: SupabaseEntityAliasRpc,
): Promise<PersistEntityAliasCatalogResult> {
  const gateway: EntityAliasCatalogPersistenceGateway = (validatedRequest) =>
    persistThroughRpc(validatedRequest, rpc);
  return persistEntityAliasCatalog(request, gateway);
}
