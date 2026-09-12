import "server-only";

import type {
  ScanLeaseGatewayResult,
  ScanLeaseSummary,
  ScanRetryGatewayResult,
  ScanRetrySummary,
  ScanWorkClaim,
  ScanWorkClaimGatewayResult,
  ScanWorkQuery,
  ValidatedScanLeaseRequest,
  ValidatedScanRetryRequest,
  ValidatedScanWorkClaimRequest,
} from "../application/scan-worker.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const POSITIVE_INTEGER_TEXT = /^[1-9][0-9]*$/;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const QUERY_VERSIONS = new Set([
  "category@v1",
  "service-area@v1",
  "best-audience@v1",
  "alternatives@v1",
  "comparison-category@v1",
  "use-case@v1",
  "use-case-audience@v1",
  "buyer@v1",
]);

export type SupabaseClaimScanWorkRpc = (
  args: Readonly<{
    p_worker_id: string;
    p_lease_seconds: number;
  }>,
) => Promise<unknown>;

export type SupabaseRenewScanWorkLeaseRpc = (
  args: Readonly<{
    p_workspace_id: string;
    p_scan_id: string;
    p_attempt_id: string;
    p_worker_id: string;
    p_lease_token: string;
    p_lease_seconds: number;
  }>,
) => Promise<unknown>;

export type SupabaseRetryScanWorkRpc = (
  args: Readonly<{
    p_workspace_id: string;
    p_scan_id: string;
    p_attempt_id: string;
    p_worker_id: string;
    p_lease_token: string;
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
    value.length > 0 &&
    value.length <= max &&
    value.trim().length > 0 &&
    value.isWellFormed()
  );
}

function positiveSafeInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= max
  );
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    RFC3339_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function mapDatabaseError(error: Record<string, unknown>) {
  if (error.code === "P0001" && error.message === "Scan lease not found")
    return { ok: false as const, code: "lease_not_found" as const };
  if (error.code === "P0001" && error.message === "Scan lease expired")
    return { ok: false as const, code: "lease_expired" as const };
  return { ok: false as const, code: "database_error" as const };
}

function parseEnvelope(response: unknown):
  | Readonly<{ ok: true; data: unknown }>
  | Readonly<{
      ok: false;
      code: "database_error" | "invalid_database_response" | "lease_not_found" | "lease_expired";
    }> {
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

  return { ok: true, data: response.data };
}

function parseQuery(value: unknown, expectedOrdinal: number): ScanWorkQuery | null {
  if (
    !record(value) ||
    value.queryOrdinal !== expectedOrdinal ||
    !boundedText(value.queryId, 8192) ||
    typeof value.queryVersion !== "string" ||
    !QUERY_VERSIONS.has(value.queryVersion) ||
    !boundedText(value.queryText, 600) ||
    !validUuid(value.observationId)
  )
    return null;

  return Object.freeze({
    queryOrdinal: expectedOrdinal,
    queryId: value.queryId,
    queryVersion: value.queryVersion,
    queryText: value.queryText,
    observationId: value.observationId.toLowerCase(),
  });
}

function parseClaim(value: unknown): ScanWorkClaim | null {
  if (
    !record(value) ||
    !validUuid(value.workspaceId) ||
    !validUuid(value.scanId) ||
    !validUuid(value.projectId) ||
    !validUuid(value.reservationId) ||
    !validUuid(value.attemptId) ||
    !positiveSafeInteger(value.attemptNumber, 10) ||
    !validUuid(value.workerId) ||
    !validUuid(value.leaseToken) ||
    !validTimestamp(value.leaseExpiresAt) ||
    value.provider !== "gemini" ||
    !boundedText(value.modelId, 120) ||
    !boundedText(value.priceVersion, 120) ||
    typeof value.currency !== "string" ||
    !CURRENCY_PATTERN.test(value.currency) ||
    typeof value.reservedMicrounits !== "string" ||
    !POSITIVE_INTEGER_TEXT.test(value.reservedMicrounits) ||
    !positiveSafeInteger(value.maxAttempts, 10) ||
    value.attemptNumber > value.maxAttempts ||
    !positiveSafeInteger(value.maxOutputTokens) ||
    !Array.isArray(value.queries) ||
    value.queries.length < 1 ||
    value.queries.length > 10
  )
    return null;

  const queries: ScanWorkQuery[] = [];
  const observationIds = new Set<string>();
  for (let ordinal = 0; ordinal < value.queries.length; ordinal += 1) {
    const query = parseQuery(value.queries[ordinal], ordinal);
    if (query === null || observationIds.has(query.observationId)) return null;
    observationIds.add(query.observationId);
    queries.push(query);
  }

  return Object.freeze({
    workspaceId: value.workspaceId.toLowerCase(),
    scanId: value.scanId.toLowerCase(),
    projectId: value.projectId.toLowerCase(),
    reservationId: value.reservationId.toLowerCase(),
    attemptId: value.attemptId.toLowerCase(),
    attemptNumber: value.attemptNumber,
    workerId: value.workerId.toLowerCase(),
    leaseToken: value.leaseToken.toLowerCase(),
    leaseExpiresAt: value.leaseExpiresAt,
    provider: "gemini",
    modelId: value.modelId,
    priceVersion: value.priceVersion,
    currency: value.currency,
    reservedMicrounits: value.reservedMicrounits,
    maxAttempts: value.maxAttempts,
    maxOutputTokens: value.maxOutputTokens,
    queries: Object.freeze(queries),
  });
}

function parseLease(value: unknown): ScanLeaseSummary | null {
  if (
    !record(value) ||
    !validUuid(value.workspaceId) ||
    !validUuid(value.scanId) ||
    !validUuid(value.attemptId) ||
    !validUuid(value.workerId) ||
    !validUuid(value.leaseToken) ||
    !validTimestamp(value.leaseExpiresAt)
  )
    return null;

  return Object.freeze({
    workspaceId: value.workspaceId.toLowerCase(),
    scanId: value.scanId.toLowerCase(),
    attemptId: value.attemptId.toLowerCase(),
    workerId: value.workerId.toLowerCase(),
    leaseToken: value.leaseToken.toLowerCase(),
    leaseExpiresAt: value.leaseExpiresAt,
  });
}

function parseRetry(value: unknown): ScanRetrySummary | null {
  if (
    !record(value) ||
    !validUuid(value.workspaceId) ||
    !validUuid(value.scanId) ||
    !validUuid(value.attemptId) ||
    !positiveSafeInteger(value.attemptNumber, 10) ||
    !positiveSafeInteger(value.maxAttempts, 10) ||
    value.attemptNumber > value.maxAttempts ||
    (value.nextState !== "queued" && value.nextState !== "failed") ||
    typeof value.retryScheduled !== "boolean" ||
    (value.nextState === "queued") !== value.retryScheduled
  )
    return null;

  return Object.freeze({
    workspaceId: value.workspaceId.toLowerCase(),
    scanId: value.scanId.toLowerCase(),
    attemptId: value.attemptId.toLowerCase(),
    attemptNumber: value.attemptNumber,
    maxAttempts: value.maxAttempts,
    nextState: value.nextState,
    retryScheduled: value.retryScheduled,
  });
}

export async function executeSupabaseScanWorkClaim(
  request: ValidatedScanWorkClaimRequest,
  rpc: SupabaseClaimScanWorkRpc,
): Promise<ScanWorkClaimGatewayResult> {
  let response: unknown;
  try {
    response = await rpc({
      p_worker_id: request.workerId,
      p_lease_seconds: request.leaseSeconds,
    });
  } catch {
    return { ok: false, code: "database_error" };
  }

  const envelope = parseEnvelope(response);
  if (!envelope.ok) return envelope;
  if (envelope.data === null) return { ok: true, claim: null };

  const claim = parseClaim(envelope.data);
  if (claim === null) return { ok: false, code: "invalid_database_response" };
  return { ok: true, claim };
}

export async function executeSupabaseScanLeaseRenewal(
  request: ValidatedScanLeaseRequest,
  rpc: SupabaseRenewScanWorkLeaseRpc,
): Promise<ScanLeaseGatewayResult> {
  let response: unknown;
  try {
    response = await rpc({
      p_workspace_id: request.workspaceId,
      p_scan_id: request.scanId,
      p_attempt_id: request.attemptId,
      p_worker_id: request.workerId,
      p_lease_token: request.leaseToken,
      p_lease_seconds: request.leaseSeconds,
    });
  } catch {
    return { ok: false, code: "database_error" };
  }

  const envelope = parseEnvelope(response);
  if (!envelope.ok) return envelope;
  const lease = parseLease(envelope.data);
  if (lease === null) return { ok: false, code: "invalid_database_response" };
  return { ok: true, lease };
}

export async function executeSupabaseScanRetry(
  request: ValidatedScanRetryRequest,
  rpc: SupabaseRetryScanWorkRpc,
): Promise<ScanRetryGatewayResult> {
  let response: unknown;
  try {
    response = await rpc({
      p_workspace_id: request.workspaceId,
      p_scan_id: request.scanId,
      p_attempt_id: request.attemptId,
      p_worker_id: request.workerId,
      p_lease_token: request.leaseToken,
    });
  } catch {
    return { ok: false, code: "database_error" };
  }

  const envelope = parseEnvelope(response);
  if (!envelope.ok) return envelope;
  const retry = parseRetry(envelope.data);
  if (retry === null) return { ok: false, code: "invalid_database_response" };
  return { ok: true, retry };
}
