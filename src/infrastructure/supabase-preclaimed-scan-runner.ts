import "server-only";

import type { ClaimedLiveProviderFactory, ClaimScanExecutionResult } from "../application/claim-scan-execution.ts";
import type { GroundedObservationPersistenceGateway } from "../application/grounded-observation-persistence.ts";
import {
  executePreclaimedScanQueries,
  type PreclaimedScanWorkerGateway,
} from "../application/preclaimed-scan-execution.ts";
import type { ScanCompletionGateway } from "../application/scan-completion.ts";
import type { ScanWorkClaim } from "../application/scan-worker.ts";
import { executeSupabaseGroundedObservationPersistence } from "./supabase-grounded-observation-persistence.ts";
import { executeSupabaseScanCompletion } from "./supabase-scan-completion.ts";
import {
  executeSupabaseScanLeaseRenewal,
  executeSupabaseScanRetry,
} from "./supabase-scan-worker.ts";

export type SupabasePreclaimedScanRpcName =
  | "renew_scan_work_lease"
  | "retry_scan_work"
  | "persist_grounded_observation"
  | "complete_scan_work";

export type SupabasePreclaimedScanRpc = (
  name: SupabasePreclaimedScanRpcName,
  args: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

/**
 * Server-only adapter for executing an exact targeted claim. Deliberately no
 * global claim RPC is representable here: the supplied claim is renewed,
 * executed, durably persisted, and completed using only its exact lease identity.
 */
export async function executeSupabasePreclaimedScan(
  request: Readonly<{
    claim: ScanWorkClaim;
    leaseSeconds: unknown;
  }>,
  rpc: SupabasePreclaimedScanRpc,
  providerFactory: ClaimedLiveProviderFactory,
  signal?: AbortSignal,
): Promise<ClaimScanExecutionResult> {
  const workerGateway: PreclaimedScanWorkerGateway = Object.freeze({
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

  return executePreclaimedScanQueries(
    request,
    workerGateway,
    providerFactory,
    persistenceGateway,
    completionGateway,
    signal,
  );
}
