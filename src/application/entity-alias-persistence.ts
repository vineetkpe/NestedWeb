import {
  prepareEntityAliasCatalog,
  type PreparedEntityAliasCatalog,
} from "../domain/entity-alias.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PersistEntityAliasCatalogRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  idempotencyKey: unknown;
  entities: unknown;
}>;

export type ValidatedEntityAliasCatalogPersistenceRequest = Readonly<{
  workspaceId: string;
  projectId: string;
  idempotencyKey: string;
  catalog: PreparedEntityAliasCatalog;
}>;

export type PersistedEntityAlias = Readonly<{
  aliasId: string;
  aliasOrdinal: number;
  aliasText: string;
  normalizedAlias: string;
  matchState: "eligible" | "ambiguous";
}>;

export type PersistedEntityAliasEntity = Readonly<{
  entityId: string;
  entityOrdinal: number;
  entityKind: "company" | "product";
  canonicalName: string;
  aliases: readonly PersistedEntityAlias[];
}>;

export type PersistedEntityAliasCatalog = Readonly<{
  catalogId: string;
  methodVersion: "entity-alias-v1";
  requestFingerprint: string;
  entityCount: number;
  aliasCount: number;
  replayed: boolean;
  entities: readonly PersistedEntityAliasEntity[];
}>;

export type EntityAliasCatalogPersistenceGatewayFailureCode =
  | "project_access_denied"
  | "idempotency_conflict"
  | "database_error"
  | "invalid_database_response";

export type EntityAliasCatalogPersistenceGatewayResult =
  | Readonly<{ ok: true; catalog: PersistedEntityAliasCatalog }>
  | Readonly<{
      ok: false;
      code: EntityAliasCatalogPersistenceGatewayFailureCode;
    }>;

export type EntityAliasCatalogPersistenceGateway = (
  request: ValidatedEntityAliasCatalogPersistenceRequest,
) => Promise<EntityAliasCatalogPersistenceGatewayResult>;

export type PersistEntityAliasCatalogResult =
  | EntityAliasCatalogPersistenceGatewayResult
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "invalid_project_id"
        | "invalid_idempotency_key"
        | "invalid_entities";
    }>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

/**
 * Persists one immutable, customer-approved alias catalog snapshot. This use
 * case derives normalization/collision state locally before the database
 * independently validates the same versioned contract.
 */
export async function persistEntityAliasCatalog(
  request: PersistEntityAliasCatalogRequest,
  gateway: EntityAliasCatalogPersistenceGateway,
): Promise<PersistEntityAliasCatalogResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) return { ok: false, code: "invalid_workspace_id" };

  const projectId = normalizeUuid(request.projectId);
  if (projectId === null) return { ok: false, code: "invalid_project_id" };

  const idempotencyKey = normalizeUuid(request.idempotencyKey);
  if (idempotencyKey === null)
    return { ok: false, code: "invalid_idempotency_key" };

  const catalog = prepareEntityAliasCatalog(request.entities);
  if (catalog === null) return { ok: false, code: "invalid_entities" };

  return gateway(
    Object.freeze({
      workspaceId,
      projectId,
      idempotencyKey,
      catalog,
    }),
  );
}
