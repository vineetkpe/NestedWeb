import {
  MAX_SCAN_LEASE_SECONDS,
  MIN_SCAN_LEASE_SECONDS,
  type ScanWorkClaim,
  type ScanWorkClaimGatewayResult,
} from "./scan-worker.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TargetedScanClaimRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  scanId: unknown;
  reservationId: unknown;
  workerId: unknown;
  leaseSeconds: unknown;
}>;

export type ValidatedTargetedScanClaimRequest = Readonly<{
  workspaceId: string;
  projectId: string;
  scanId: string;
  reservationId: string;
  workerId: string;
  leaseSeconds: number;
}>;

export type TargetedScanClaimGateway = (
  request: ValidatedTargetedScanClaimRequest,
) => Promise<ScanWorkClaimGatewayResult>;

export type TargetedScanClaimResult =
  | Readonly<{ ok: true; claim: ScanWorkClaim | null }>
  | Readonly<{
      ok: false;
      code:
        | Exclude<ScanWorkClaimGatewayResult, { ok: true }>["code"]
        | "invalid_workspace_id"
        | "invalid_project_id"
        | "invalid_scan_id"
        | "invalid_reservation_id"
        | "invalid_worker_id"
        | "invalid_lease_seconds"
        | "claim_identity_mismatch";
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

function sameClaimIdentity(
  request: ValidatedTargetedScanClaimRequest,
  claim: ScanWorkClaim,
): boolean {
  return (
    claim.workspaceId === request.workspaceId &&
    claim.projectId === request.projectId &&
    claim.scanId === request.scanId &&
    claim.reservationId === request.reservationId &&
    claim.workerId === request.workerId
  );
}

/**
 * Claims only one exact already-reserved scan. The gateway is expected to bind
 * to the service-only targeted database RPC; a null claim means the exact scan
 * remains safely queued because other work is ahead of it.
 */
export async function claimTargetedScanWork(
  request: TargetedScanClaimRequest,
  gateway: TargetedScanClaimGateway,
): Promise<TargetedScanClaimResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) return { ok: false, code: "invalid_workspace_id" };
  const projectId = normalizeUuid(request.projectId);
  if (projectId === null) return { ok: false, code: "invalid_project_id" };
  const scanId = normalizeUuid(request.scanId);
  if (scanId === null) return { ok: false, code: "invalid_scan_id" };
  const reservationId = normalizeUuid(request.reservationId);
  if (reservationId === null)
    return { ok: false, code: "invalid_reservation_id" };
  const workerId = normalizeUuid(request.workerId);
  if (workerId === null) return { ok: false, code: "invalid_worker_id" };
  const leaseSeconds = normalizeLeaseSeconds(request.leaseSeconds);
  if (leaseSeconds === null)
    return { ok: false, code: "invalid_lease_seconds" };

  const validated = Object.freeze({
    workspaceId,
    projectId,
    scanId,
    reservationId,
    workerId,
    leaseSeconds,
  });
  const result = await gateway(validated);
  if (!result.ok || result.claim === null) return result;
  if (!sameClaimIdentity(validated, result.claim))
    return { ok: false, code: "claim_identity_mismatch" };

  return result;
}
