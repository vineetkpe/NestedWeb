import type { GroundedAIProvider } from "./grounded-ai-provider.ts";
import {
  executeClaimedQuery,
  type ExecuteClaimedQueryResult,
} from "./execute-claimed-query.ts";
import type { GroundedObservationPersistenceGateway } from "./grounded-observation-persistence.ts";
import {
  claimScanWork,
  type ScanWorkClaim,
  type ScanWorkerGateway,
  type ScanWorkClaimResult,
} from "./scan-worker.ts";

export type ClaimedLiveProviderFactory = (
  config: Readonly<{
    provider: "gemini";
    modelId: string;
    maxOutputTokens: number;
  }>,
) => GroundedAIProvider | null;

export type ClaimFirstQueryResult =
  | Readonly<{ ok: true; state: "idle" }>
  | Readonly<{
      ok: true;
      state: "persisted";
      workspaceId: string;
      scanId: string;
      attemptId: string;
      observationId: string;
    }>
  | Readonly<{
      ok: false;
      stage: "claim";
      code: Exclude<ScanWorkClaimResult, { ok: true }>["code"];
    }>
  | Readonly<{
      ok: false;
      stage: "provider_setup";
      code: "provider_setup_failed";
    }>
  | Readonly<{
      ok: false;
      stage: "query";
      result: Exclude<ExecuteClaimedQueryResult, { ok: true }>;
    }>;

function providerForClaim(
  claim: ScanWorkClaim,
  factory: ClaimedLiveProviderFactory,
): GroundedAIProvider | null {
  return factory(
    Object.freeze({
      provider: claim.provider,
      modelId: claim.modelId,
      maxOutputTokens: claim.maxOutputTokens,
    }),
  );
}

/**
 * Claims at most one database-authorized scan attempt and executes only query 0.
 * This slice does not loop the cohort, renew/retry leases, complete scans or settle cost.
 */
export async function claimAndExecuteFirstQuery(
  request: Readonly<{
    workerId: unknown;
    leaseSeconds: unknown;
  }>,
  workerGateway: ScanWorkerGateway,
  providerFactory: ClaimedLiveProviderFactory,
  persistenceGateway: GroundedObservationPersistenceGateway,
  signal?: AbortSignal,
): Promise<ClaimFirstQueryResult> {
  const claimed = await claimScanWork(request, workerGateway);
  if (!claimed.ok)
    return { ok: false, stage: "claim", code: claimed.code };
  if (claimed.claim === null) return { ok: true, state: "idle" };

  const provider = providerForClaim(claimed.claim, providerFactory);
  if (provider === null)
    return {
      ok: false,
      stage: "provider_setup",
      code: "provider_setup_failed",
    };

  const executed = await executeClaimedQuery(
    claimed.claim,
    0,
    provider,
    persistenceGateway,
    signal,
  );
  if (!executed.ok)
    return { ok: false, stage: "query", result: executed };

  return {
    ok: true,
    state: "persisted",
    workspaceId: claimed.claim.workspaceId,
    scanId: claimed.claim.scanId,
    attemptId: claimed.claim.attemptId,
    observationId: executed.snapshot.observationId,
  };
}
