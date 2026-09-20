const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_OR_ZERO_INTEGER_TEXT = /^(0|[1-9][0-9]*)$/;

export type ScanCompletionSummary = Readonly<{
  workspaceId: string;
  scanId: string;
  attemptId: string;
  state: "completed" | "partial";
  reservationStatus: "settled" | "released";
  settledMicrounits: string;
  costBasis: "gross_list_price";
  replayed: boolean;
}>;

export type ScanCompletionGatewayFailureCode =
  | "lease_not_found"
  | "lease_expired"
  | "evidence_incomplete"
  | "metering_unavailable"
  | "invalid_metering"
  | "cost_exceeded"
  | "database_error"
  | "invalid_database_response";

export type ScanCompletionGatewayResult =
  | Readonly<{ ok: true; completion: ScanCompletionSummary }>
  | Readonly<{ ok: false; code: ScanCompletionGatewayFailureCode }>;

export type ValidatedScanCompletionRequest = Readonly<{
  workspaceId: string;
  scanId: string;
  attemptId: string;
  workerId: string;
  leaseToken: string;
}>;

export type ScanCompletionRequest = Readonly<{
  workspaceId: unknown;
  scanId: unknown;
  attemptId: unknown;
  workerId: unknown;
  leaseToken: unknown;
}>;

export type ScanCompletionGateway = (
  request: ValidatedScanCompletionRequest,
) => Promise<ScanCompletionGatewayResult>;

export type CompleteScanWorkResult =
  | ScanCompletionGatewayResult
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

export function validSettledMicrounits(value: unknown): value is string {
  return (
    typeof value === "string" &&
    POSITIVE_OR_ZERO_INTEGER_TEXT.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}

export async function completeScanWork(
  request: ScanCompletionRequest,
  gateway: ScanCompletionGateway,
): Promise<CompleteScanWorkResult> {
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

  return gateway(
    Object.freeze({ workspaceId, scanId, attemptId, workerId, leaseToken }),
  );
}
