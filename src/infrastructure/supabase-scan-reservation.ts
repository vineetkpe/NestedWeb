import "server-only";

import type {
  ScanReservationGatewayResult,
  ScanReservationSummary,
  ValidatedReserveScanRequest,
} from "../application/scan-reservation.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const POSITIVE_INTEGER_TEXT = /^[1-9][0-9]*$/;

export type SupabaseScanReservationRpc = (
  args: Readonly<{
    p_workspace_id: string;
    p_project_id: string;
    p_idempotency_key: string;
    p_prompt_method_version: "niche-prompts-v1";
    p_profile_method_version: "company-profile-v2";
    p_queries: readonly Readonly<{
      queryId: string;
      queryVersion: string;
      queryText: string;
    }>[];
  }>,
) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function boundedText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= 1 &&
    value.length <= max &&
    value.isWellFormed()
  );
}

function positiveSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function mapDatabaseError(
  error: Record<string, unknown>,
): Exclude<ScanReservationGatewayResult, { ok: true }> {
  const code = error.code;
  const message = error.message;

  if (code === "42501") return { ok: false, code: "authorization_denied" };
  if (
    code === "22023" &&
    message === "Idempotency key reused with different scan request"
  )
    return { ok: false, code: "idempotency_conflict" };

  if (code === "P0001" && typeof message === "string") {
    if (
      message === "Scan execution unavailable" ||
      message === "Workspace budget window unavailable" ||
      message === "Project budget window unavailable" ||
      message === "Provider pricing unavailable"
    )
      return { ok: false, code: "execution_unavailable" };
    if (message === "Scan query limit exceeded")
      return { ok: false, code: "query_limit_exceeded" };
    if (
      message === "Workspace scan concurrency exhausted" ||
      message === "Project scan concurrency exhausted" ||
      message === "Provider scan concurrency exhausted"
    )
      return { ok: false, code: "concurrency_exhausted" };
    if (
      message === "Workspace scan request limit exhausted" ||
      message === "Project scan request limit exhausted"
    )
      return { ok: false, code: "request_limit_exhausted" };
    if (
      message === "Workspace scan budget exhausted" ||
      message === "Project scan budget exhausted"
    )
      return { ok: false, code: "budget_exhausted" };
  }

  return { ok: false, code: "database_error" };
}

function parseReservation(value: unknown): ScanReservationSummary | null {
  if (
    !record(value) ||
    !validUuid(value.scanId) ||
    !validUuid(value.reservationId) ||
    typeof value.reservedMicrounits !== "string" ||
    !POSITIVE_INTEGER_TEXT.test(value.reservedMicrounits) ||
    typeof value.currency !== "string" ||
    !CURRENCY_PATTERN.test(value.currency) ||
    value.provider !== "gemini" ||
    !boundedText(value.modelId, 120) ||
    !boundedText(value.priceVersion, 120) ||
    typeof value.maxAttempts !== "number" ||
    !Number.isSafeInteger(value.maxAttempts) ||
    value.maxAttempts < 1 ||
    value.maxAttempts > 10 ||
    !positiveSafeInteger(value.maxOutputTokens) ||
    typeof value.requestFingerprint !== "string" ||
    !FINGERPRINT_PATTERN.test(value.requestFingerprint) ||
    typeof value.replayed !== "boolean"
  )
    return null;

  return Object.freeze({
    scanId: value.scanId.toLowerCase(),
    reservationId: value.reservationId.toLowerCase(),
    reservedMicrounits: value.reservedMicrounits,
    currency: value.currency,
    provider: "gemini",
    modelId: value.modelId,
    priceVersion: value.priceVersion,
    maxAttempts: value.maxAttempts,
    maxOutputTokens: value.maxOutputTokens,
    requestFingerprint: value.requestFingerprint,
    replayed: value.replayed,
  });
}

export async function executeSupabaseScanReservation(
  request: ValidatedReserveScanRequest,
  rpc: SupabaseScanReservationRpc,
): Promise<ScanReservationGatewayResult> {
  let response: unknown;
  try {
    response = await rpc({
      p_workspace_id: request.workspaceId,
      p_project_id: request.projectId,
      p_idempotency_key: request.idempotencyKey,
      p_prompt_method_version: request.promptMethodVersion,
      p_profile_method_version: request.profileMethodVersion,
      p_queries: request.queries.map((query) => ({
        queryId: query.queryId,
        queryVersion: query.queryVersion,
        queryText: query.queryText,
      })),
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
    if (!record(response.error))
      return { ok: false, code: "database_error" };
    return mapDatabaseError(response.error);
  }

  const reservation = parseReservation(response.data);
  if (reservation === null)
    return { ok: false, code: "invalid_database_response" };

  return { ok: true, reservation };
}
