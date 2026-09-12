const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MIN_SCAN_LEASE_SECONDS = 15;
export const MAX_SCAN_LEASE_SECONDS = 300;

export type ScanWorkQuery = Readonly<{
  queryOrdinal: number;
  queryId: string;
  queryVersion: string;
  queryText: string;
  observationId: string;
}>;

export type ScanWorkClaim = Readonly<{
  workspaceId: string;
  scanId: string;
  projectId: string;
  reservationId: string;
  attemptId: string;
  attemptNumber: number;
  workerId: string;
  leaseToken: string;
  leaseExpiresAt: string;
  provider: "gemini";
  modelId: string;
  priceVersion: string;
  currency: string;
  reservedMicrounits: string;
  maxAttempts: number;
  maxOutputTokens: number;
  queries: readonly ScanWorkQuery[];
}>;

export type ScanLeaseSummary = Readonly<{
  workspaceId: string;
  scanId: string;
  attemptId: string;
  workerId: string;
  leaseToken: string;
  leaseExpiresAt: string;
}>;

export type ScanRetrySummary = Readonly<{
  workspaceId: string;
  scanId: string;
  attemptId: string;
  attemptNumber: number;
  maxAttempts: number;
  nextState: "queued" | "failed";
  retryScheduled: boolean;
}>;

export type ScanWorkerGatewayFailureCode =
  | "lease_not_found"
  | "lease_expired"
  | "database_error"
  | "invalid_database_response";

export type ScanWorkClaimGatewayResult =
  | Readonly<{ ok: true; claim: ScanWorkClaim | null }>
  | Readonly<{ ok: false; code: ScanWorkerGatewayFailureCode }>;

export type ScanLeaseGatewayResult =
  | Readonly<{ ok: true; lease: ScanLeaseSummary }>
  | Readonly<{ ok: false; code: ScanWorkerGatewayFailureCode }>;

export type ScanRetryGatewayResult =
  | Readonly<{ ok: true; retry: ScanRetrySummary }>
  | Readonly<{ ok: false; code: ScanWorkerGatewayFailureCode }>;

export type ScanWorkerGateway = Readonly<{
  claim: (request: ValidatedScanWorkClaimRequest) => Promise<ScanWorkClaimGatewayResult>;
  renew: (request: ValidatedScanLeaseRequest) => Promise<ScanLeaseGatewayResult>;
  retry: (request: ValidatedScanRetryRequest) => Promise<ScanRetryGatewayResult>;
}>;

export type ScanWorkClaimRequest = Readonly<{
  workerId: unknown;
  leaseSeconds: unknown;
}>;

export type ScanLeaseRequest = Readonly<{
  workspaceId: unknown;
  scanId: unknown;
  attemptId: unknown;
  workerId: unknown;
  leaseToken: unknown;
  leaseSeconds: unknown;
}>;

export type ScanRetryRequest = Readonly<{
  workspaceId: unknown;
  scanId: unknown;
  attemptId: unknown;
  workerId: unknown;
  leaseToken: unknown;
}>;

export type ValidatedScanWorkClaimRequest = Readonly<{
  workerId: string;
  leaseSeconds: number;
}>;

export type ValidatedScanLeaseRequest = Readonly<{
  workspaceId: string;
  scanId: string;
  attemptId: string;
  workerId: string;
  leaseToken: string;
  leaseSeconds: number;
}>;

export type ValidatedScanRetryRequest = Readonly<{
  workspaceId: string;
  scanId: string;
  attemptId: string;
  workerId: string;
  leaseToken: string;
}>;

export type ScanWorkClaimResult =
  | ScanWorkClaimGatewayResult
  | Readonly<{
      ok: false;
      code: "invalid_worker_id" | "invalid_lease_seconds";
    }>;

export type ScanLeaseResult =
  | ScanLeaseGatewayResult
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "invalid_scan_id"
        | "invalid_attempt_id"
        | "invalid_worker_id"
        | "invalid_lease_token"
        | "invalid_lease_seconds";
    }>;

export type ScanRetryResult =
  | ScanRetryGatewayResult
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "invalid_scan_id"
        | "invalid_attempt_id"
        | "invalid_worker_id"
        | "invalid_lease_token";
    }>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function normalizeLeaseSeconds(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < MIN_SCAN_LEASE_SECONDS ||
    value > MAX_SCAN_LEASE_SECONDS
  )
    return null;
  return value;
}

function validateLeaseIdentity(request: ScanRetryRequest):
  | Readonly<{ ok: true; request: ValidatedScanRetryRequest }>
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "invalid_scan_id"
        | "invalid_attempt_id"
        | "invalid_worker_id"
        | "invalid_lease_token";
    }> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) return { ok: false, code: "invalid_workspace_id" };
  const scanId = normalizeUuid(request.scanId);
  if (scanId === null) return { ok: false, code: "invalid_scan_id" };
  const attemptId = normalizeUuid(request.attemptId);
  if (attemptId === null) return { ok: false, code: "invalid_attempt_id" };
  const workerId = normalizeUuid(request.workerId);
  if (workerId === null) return { ok: false, code: "invalid_worker_id" };
  const leaseToken = normalizeUuid(request.leaseToken);
  if (leaseToken === null) return { ok: false, code: "invalid_lease_token" };

  return {
    ok: true,
    request: Object.freeze({
      workspaceId,
      scanId,
      attemptId,
      workerId,
      leaseToken,
    }),
  };
}

export async function claimScanWork(
  request: ScanWorkClaimRequest,
  gateway: ScanWorkerGateway,
): Promise<ScanWorkClaimResult> {
  const workerId = normalizeUuid(request.workerId);
  if (workerId === null) return { ok: false, code: "invalid_worker_id" };
  const leaseSeconds = normalizeLeaseSeconds(request.leaseSeconds);
  if (leaseSeconds === null) return { ok: false, code: "invalid_lease_seconds" };

  return gateway.claim(Object.freeze({ workerId, leaseSeconds }));
}

export async function renewScanWorkLease(
  request: ScanLeaseRequest,
  gateway: ScanWorkerGateway,
): Promise<ScanLeaseResult> {
  const identity = validateLeaseIdentity(request);
  if (!identity.ok) return identity;
  const leaseSeconds = normalizeLeaseSeconds(request.leaseSeconds);
  if (leaseSeconds === null) return { ok: false, code: "invalid_lease_seconds" };

  return gateway.renew(
    Object.freeze({
      ...identity.request,
      leaseSeconds,
    }),
  );
}

export async function retryScanWork(
  request: ScanRetryRequest,
  gateway: ScanWorkerGateway,
): Promise<ScanRetryResult> {
  const identity = validateLeaseIdentity(request);
  if (!identity.ok) return identity;
  return gateway.retry(identity.request);
}
