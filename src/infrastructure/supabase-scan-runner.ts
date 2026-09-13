import "server-only";

import {
  claimAndExecuteScanQueries,
  type ClaimedLiveProviderFactory,
  type ClaimScanExecutionResult,
} from "../application/claim-scan-execution.ts";
import type { GroundedObservationPersistenceGateway } from "../application/grounded-observation-persistence.ts";
import type { ScanCompletionGateway } from "../application/scan-completion.ts";
import type { ScanWorkerGateway } from "../application/scan-worker.ts";
import { executeSupabaseGroundedObservationPersistence } from "./supabase-grounded-observation-persistence.ts";
import { executeSupabaseScanCompletion } from "./supabase-scan-completion.ts";
import {
  executeSupabaseScanLeaseRenewal,
  executeSupabaseScanRetry,
  executeSupabaseScanWorkClaim,
} from "./supabase-scan-worker.ts";

export type SupabaseScanWorkerRpcName =
  | "claim_scan_work"
  | "renew_scan_work_lease"
  | "retry_scan_work"
  | "persist_grounded_observation"
  | "complete_scan_work";

export type SupabaseScanWorkerRpc = (
  name: SupabaseScanWorkerRpcName,
  args: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

/**
 * Server-only composition for one bounded worker iteration. The application
 * layer owns ordering and lease semantics; these gateways only adapt the five
 * narrow service-role RPCs. Completion is always supplied so a successful run
 * cannot stop at persisted evidence without database-side metering/settlement.
 */
export async function executeSupabaseScanWorkerOnce(
  request: Readonly<{ workerId: unknown; leaseSeconds: unknown }>,
  rpc: SupabaseScanWorkerRpc,
  providerFactory: ClaimedLiveProviderFactory,
  signal?: AbortSignal,
): Promise<ClaimScanExecutionResult> {
  const workerGateway: ScanWorkerGateway = Object.freeze({
    claim: (validated) =>
      executeSupabaseScanWorkClaim(validated, (args) =>
        rpc("claim_scan_work", args),
      ),
    renew: (validated) =>
      executeSupabaseScanLeaseRenewal(validated, (args) =>
        rpc("renew_scan_work_lease", args),
      ),
    retry: (validated) =>
      executeSupabaseScanRetry(validated, (args) =>
        rpc("retry_scan_work", args),
      ),
  });

  const persistenceGateway: GroundedObservationPersistenceGateway = (
    validated,
  ) =>
    executeSupabaseGroundedObservationPersistence(validated, (args) =>
      rpc("persist_grounded_observation", args),
    );

  const completionGateway: ScanCompletionGateway = (validated) =>
    executeSupabaseScanCompletion(validated, (args) =>
      rpc("complete_scan_work", args),
    );

  return claimAndExecuteScanQueries(
    request,
    workerGateway,
    providerFactory,
    persistenceGateway,
    completionGateway,
    signal,
  );
}
