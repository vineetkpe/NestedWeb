import "server-only";

import type { ScanWorkClaimGatewayResult } from "../application/scan-worker.ts";
import type { ValidatedTargetedScanClaimRequest } from "../application/targeted-scan-claim.ts";
import { executeSupabaseScanWorkClaim } from "./supabase-scan-worker.ts";

export type SupabaseTargetedScanClaimRpc = (
  args: Readonly<{
    p_workspace_id: string;
    p_project_id: string;
    p_scan_id: string;
    p_reservation_id: string;
    p_worker_id: string;
    p_lease_seconds: number;
  }>,
) => Promise<unknown>;

/**
 * Adapts the exact-scan claim RPC while deliberately reusing the existing
 * strict Supabase scan-claim response parser. Only the RPC argument set differs
 * from the global queue claim; returned evidence is validated identically.
 */
export async function executeSupabaseTargetedScanClaim(
  request: ValidatedTargetedScanClaimRequest,
  rpc: SupabaseTargetedScanClaimRpc,
): Promise<ScanWorkClaimGatewayResult> {
  return executeSupabaseScanWorkClaim(
    Object.freeze({
      workerId: request.workerId,
      leaseSeconds: request.leaseSeconds,
    }),
    async ({ p_worker_id, p_lease_seconds }) =>
      rpc(
        Object.freeze({
          p_workspace_id: request.workspaceId,
          p_project_id: request.projectId,
          p_scan_id: request.scanId,
          p_reservation_id: request.reservationId,
          p_worker_id,
          p_lease_seconds,
        }),
      ),
  );
}
