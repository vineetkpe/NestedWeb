import "server-only";

import type {
  PromptCohortPersistenceGatewayResult,
  PromptCohortSnapshotSummary,
  ValidatedPromptCohortPersistenceRequest,
} from "../application/prompt-cohort-persistence.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

export type SupabasePersistPromptCohortRpc = (
  args: Readonly<{
    p_workspace_id: string;
    p_project_id: string;
    p_profile_snapshot_id: string;
    p_idempotency_key: string;
    p_profile: unknown;
    p_prompts: ValidatedPromptCohortPersistenceRequest["prompts"];
  }>,
) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapDatabaseError(
  error: Record<string, unknown>,
): Exclude<PromptCohortPersistenceGatewayResult, { ok: true }> {
  if (
    error.code === "22023" &&
    error.message === "Idempotency key reused with different prompt cohort"
  )
    return { ok: false, code: "idempotency_conflict" };
  if (
    error.code === "22023" &&
    error.message === "Profile payload does not match stored snapshot"
  )
    return { ok: false, code: "profile_snapshot_mismatch" };
  if (
    error.code === "23503" &&
    error.message === "Profile snapshot not found for prompt cohort"
  )
    return { ok: false, code: "profile_snapshot_not_found" };
  return { ok: false, code: "database_error" };
}

function parseCohort(value: unknown): PromptCohortSnapshotSummary | null {
  if (
    !record(value) ||
    typeof value.cohortId !== "string" ||
    !UUID_PATTERN.test(value.cohortId) ||
    typeof value.profileSnapshotId !== "string" ||
    !UUID_PATTERN.test(value.profileSnapshotId) ||
    typeof value.requestFingerprint !== "string" ||
    !FINGERPRINT_PATTERN.test(value.requestFingerprint) ||
    typeof value.queryCount !== "number" ||
    !Number.isSafeInteger(value.queryCount) ||
    value.queryCount < 0 ||
    value.queryCount > 10 ||
    typeof value.replayed !== "boolean"
  )
    return null;

  return Object.freeze({
    cohortId: value.cohortId.toLowerCase(),
    profileSnapshotId: value.profileSnapshotId.toLowerCase(),
    requestFingerprint: value.requestFingerprint,
    queryCount: value.queryCount,
    replayed: value.replayed,
  });
}

export async function executeSupabasePromptCohortPersistence(
  request: ValidatedPromptCohortPersistenceRequest,
  rpc: SupabasePersistPromptCohortRpc,
): Promise<PromptCohortPersistenceGatewayResult> {
  let response: unknown;
  try {
    response = await rpc({
      p_workspace_id: request.workspaceId,
      p_project_id: request.projectId,
      p_profile_snapshot_id: request.profileSnapshotId,
      p_idempotency_key: request.idempotencyKey,
      p_profile: request.profile,
      p_prompts: request.prompts,
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

  const cohort = parseCohort(response.data);
  if (cohort === null) return { ok: false, code: "invalid_database_response" };
  if (cohort.profileSnapshotId !== request.profileSnapshotId)
    return { ok: false, code: "invalid_database_response" };
  if (cohort.queryCount !== request.prompts.length)
    return { ok: false, code: "invalid_database_response" };

  return { ok: true, cohort };
}
