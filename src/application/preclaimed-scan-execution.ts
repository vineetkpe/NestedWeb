import type { GroundedObservationPersistenceGateway } from "./grounded-observation-persistence.ts";
import {
  claimAndExecuteScanQueries,
  type ClaimedLiveProviderFactory,
  type ClaimScanExecutionResult,
} from "./claim-scan-execution.ts";
import type { ScanCompletionGateway } from "./scan-completion.ts";
import type { ScanWorkClaim, ScanWorkerGateway } from "./scan-worker.ts";

export type PreclaimedScanWorkerGateway = Pick<
  ScanWorkerGateway,
  "renew" | "retry"
>;

/**
 * Executes one already-authorized exact scan claim through the existing durable
 * lease/provider/persistence/completion loop. The in-memory claim facade exists
 * only to reuse the hardened execution path; it never claims another queue row.
 * Completion is mandatory so a successful run cannot stop before database-side
 * metering and settlement.
 */
export async function executePreclaimedScanQueries(
  request: Readonly<{
    claim: ScanWorkClaim;
    leaseSeconds: unknown;
  }>,
  workerGateway: PreclaimedScanWorkerGateway,
  providerFactory: ClaimedLiveProviderFactory,
  persistenceGateway: GroundedObservationPersistenceGateway,
  completionGateway: ScanCompletionGateway,
  signal?: AbortSignal,
): Promise<ClaimScanExecutionResult> {
  const exactClaimGateway: ScanWorkerGateway = Object.freeze({
    async claim(validated) {
      if (validated.workerId !== request.claim.workerId)
        return { ok: false, code: "invalid_database_response" };
      return { ok: true, claim: request.claim };
    },
    renew: workerGateway.renew,
    retry: workerGateway.retry,
  });

  return claimAndExecuteScanQueries(
    {
      workerId: request.claim.workerId,
      leaseSeconds: request.leaseSeconds,
    },
    exactClaimGateway,
    providerFactory,
    persistenceGateway,
    completionGateway,
    signal,
  );
}
