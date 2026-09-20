import "server-only";

import type {
  CompanyProfilePersistenceGatewayResult,
  CompanyProfileSnapshotSummary,
  ValidatedCompanyProfilePersistenceRequest,
} from "../application/company-profile-persistence.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

export type SupabasePersistCompanyProfileSnapshotRpc = (
  args: Readonly<{
    p_workspace_id: string;
    p_project_id: string;
    p_idempotency_key: string;
    p_captured_at: string;
    p_crawl_result: ValidatedCompanyProfilePersistenceRequest["crawlResult"];
    p_profile: ValidatedCompanyProfilePersistenceRequest["profile"];
  }>,
) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapDatabaseError(
  error: Record<string, unknown>,
): Exclude<CompanyProfilePersistenceGatewayResult, { ok: true }> {
  if (
    error.code === "22023" &&
    error.message ===
      "Idempotency key reused with different company profile snapshot"
  )
    return { ok: false, code: "idempotency_conflict" };
  return { ok: false, code: "database_error" };
}

function parseSnapshot(value: unknown): CompanyProfileSnapshotSummary | null {
  if (
    !record(value) ||
    typeof value.snapshotId !== "string" ||
    !UUID_PATTERN.test(value.snapshotId) ||
    typeof value.requestFingerprint !== "string" ||
    !FINGERPRINT_PATTERN.test(value.requestFingerprint) ||
    value.reviewState !== "pending_review" ||
    typeof value.replayed !== "boolean"
  )
    return null;

  return Object.freeze({
    snapshotId: value.snapshotId.toLowerCase(),
    requestFingerprint: value.requestFingerprint,
    reviewState: "pending_review",
    replayed: value.replayed,
  });
}

export async function executeSupabaseCompanyProfilePersistence(
  request: ValidatedCompanyProfilePersistenceRequest,
  rpc: SupabasePersistCompanyProfileSnapshotRpc,
): Promise<CompanyProfilePersistenceGatewayResult> {
  let response: unknown;
  try {
    response = await rpc({
      p_workspace_id: request.workspaceId,
      p_project_id: request.projectId,
      p_idempotency_key: request.idempotencyKey,
      p_captured_at: request.capturedAt,
      p_crawl_result: request.crawlResult,
      p_profile: request.profile,
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
  if (snapshot === null)
    return { ok: false, code: "invalid_database_response" };

  return { ok: true, snapshot };
}
