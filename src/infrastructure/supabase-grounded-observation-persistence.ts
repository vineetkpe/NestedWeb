import "server-only";

import type {
  GroundedObservationPersistenceGatewayResult,
  GroundedObservationSnapshotSummary,
  ValidatedGroundedObservationPersistenceRequest,
} from "../application/grounded-observation-persistence.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SupabasePersistGroundedObservationRpc = (
  args: Readonly<{
    p_workspace_id: string;
    p_scan_id: string;
    p_attempt_id: string;
    p_worker_id: string;
    p_lease_token: string;
    p_query_ordinal: number;
    p_observation: ValidatedGroundedObservationPersistenceRequest["observation"];
  }>,
) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapDatabaseError(
  error: Record<string, unknown>,
): Exclude<GroundedObservationPersistenceGatewayResult, { ok: true }> {
  if (error.code === "P0001" && error.message === "Scan lease not found")
    return { ok: false, code: "lease_not_found" };
  if (error.code === "P0001" && error.message === "Scan lease expired")
    return { ok: false, code: "lease_expired" };
  if (
    error.code === "22023" &&
    [
      "Grounded observation identity mismatch",
      "Raw response digest mismatch",
    ].includes(String(error.message))
  )
    return { ok: false, code: "identity_mismatch" };
  if (
    error.code === "22023" &&
    error.message === "Observation replay conflicts with stored evidence"
  )
    return { ok: false, code: "idempotency_conflict" };
  return { ok: false, code: "database_error" };
}

function parseSnapshot(
  value: unknown,
): GroundedObservationSnapshotSummary | null {
  if (
    !record(value) ||
    typeof value.observationId !== "string" ||
    !UUID_PATTERN.test(value.observationId) ||
    !["answered", "refused", "partial", "failed", "cancelled"].includes(
      String(value.state),
    ) ||
    typeof value.citationCount !== "number" ||
    !Number.isSafeInteger(value.citationCount) ||
    value.citationCount < 0 ||
    value.citationCount > 50 ||
    typeof value.replayed !== "boolean"
  )
    return null;

  return Object.freeze({
    observationId: value.observationId.toLowerCase(),
    state: value.state as GroundedObservationSnapshotSummary["state"],
    citationCount: value.citationCount,
    replayed: value.replayed,
  });
}

function expectedState(
  request: ValidatedGroundedObservationPersistenceRequest,
): GroundedObservationSnapshotSummary["state"] {
  return request.observation.outcome === "failed" &&
    request.observation.failureCode === "cancelled"
    ? "cancelled"
    : request.observation.outcome;
}

export async function executeSupabaseGroundedObservationPersistence(
  request: ValidatedGroundedObservationPersistenceRequest,
  rpc: SupabasePersistGroundedObservationRpc,
): Promise<GroundedObservationPersistenceGatewayResult> {
  let response: unknown;
  try {
    response = await rpc({
      p_workspace_id: request.workspaceId,
      p_scan_id: request.scanId,
      p_attempt_id: request.attemptId,
      p_worker_id: request.workerId,
      p_lease_token: request.leaseToken,
      p_query_ordinal: request.queryOrdinal,
      p_observation: request.observation,
    });
  } catch {
    return { ok: false, code: "database_error" };
  }

  if (
    !record(response) ||
    !Object.hasOwn(response, "data") ||
    !Object.hasOwn(response, "error")
  )
    return { ok: false, code: "invalid_database_response" };

  if (response.error !== null && response.error !== undefined) {
    if (!record(response.error)) return { ok: false, code: "database_error" };
    return mapDatabaseError(response.error);
  }

  const snapshot = parseSnapshot(response.data);
  if (
    snapshot === null ||
    snapshot.observationId !== request.observation.observationId ||
    snapshot.state !== expectedState(request) ||
    snapshot.citationCount !== request.observation.citations.length
  )
    return { ok: false, code: "invalid_database_response" };

  return { ok: true, snapshot };
}
