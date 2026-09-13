import type { GroundedAIProvider } from "./grounded-ai-provider.ts";
import {
  executeClaimedQuery,
  type ExecuteClaimedQueryResult,
} from "./execute-claimed-query.ts";
import type { GroundedObservationPersistenceGateway } from "./grounded-observation-persistence.ts";
import {
  claimScanWork,
  renewScanWorkLease,
  type ScanLeaseResult,
  type ScanWorkClaim,
  type ScanWorkerGateway,
  type ScanWorkClaimResult,
} from "./scan-worker.ts";

export const MIN_LIVE_SCAN_LEASE_SECONDS = 30;

export type ClaimedLiveProviderFactory = (
  config: Readonly<{
    provider: "gemini";
    modelId: string;
    maxOutputTokens: number;
  }>,
) => GroundedAIProvider | null;

export type ClaimScanExecutionResult =
  | Readonly<{ ok: true; state: "idle" }>
  | Readonly<{
      ok: true;
      state: "persisted";
      workspaceId: string;
      scanId: string;
      attemptId: string;
      observationIds: readonly string[];
    }>
  | Readonly<{
      ok: false;
      stage: "claim";
      code:
        | Exclude<ScanWorkClaimResult, { ok: true }>["code"]
        | "invalid_live_lease_seconds";
    }>
  | Readonly<{
      ok: false;
      stage: "provider_setup";
      code: "provider_setup_failed";
    }>
  | Readonly<{
      ok: false;
      stage: "renew";
      queryOrdinal: number;
      code:
        | Exclude<ScanLeaseResult, { ok: true }>["code"]
        | "lease_identity_mismatch";
    }>
  | Readonly<{
      ok: false;
      stage: "query";
      queryOrdinal: number;
      result: Exclude<ExecuteClaimedQueryResult, { ok: true }>;
    }>;

function validLiveLeaseSeconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= MIN_LIVE_SCAN_LEASE_SECONDS &&
    value <= 300
  );
}

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

function sameLeaseIdentity(
  claim: ScanWorkClaim,
  lease: Extract<ScanLeaseResult, { ok: true }>["lease"],
): boolean {
  return (
    lease.workspaceId === claim.workspaceId &&
    lease.scanId === claim.scanId &&
    lease.attemptId === claim.attemptId &&
    lease.workerId === claim.workerId &&
    lease.leaseToken === claim.leaseToken
  );
}

/**
 * Claims one database-authorized scan and persists every claimed query in order.
 * A fresh lease window is required immediately before each paid provider request.
 * Retry, completion and monetary settlement remain separate orchestration steps.
 */
export async function claimAndExecuteScanQueries(
  request: Readonly<{
    workerId: unknown;
    leaseSeconds: unknown;
  }>,
  workerGateway: ScanWorkerGateway,
  providerFactory: ClaimedLiveProviderFactory,
  persistenceGateway: GroundedObservationPersistenceGateway,
  signal?: AbortSignal,
): Promise<ClaimScanExecutionResult> {
  if (!validLiveLeaseSeconds(request.leaseSeconds))
    return {
      ok: false,
      stage: "claim",
      code: "invalid_live_lease_seconds",
    };

  const claimed = await claimScanWork(request, workerGateway);
  if (!claimed.ok) return { ok: false, stage: "claim", code: claimed.code };
  if (claimed.claim === null) return { ok: true, state: "idle" };

  const claim = claimed.claim;
  const provider = providerForClaim(claim, providerFactory);
  if (provider === null)
    return {
      ok: false,
      stage: "provider_setup",
      code: "provider_setup_failed",
    };

  const observationIds: string[] = [];
  for (
    let queryOrdinal = 0;
    queryOrdinal < claim.queries.length;
    queryOrdinal += 1
  ) {
    const renewed = await renewScanWorkLease(
      {
        workspaceId: claim.workspaceId,
        scanId: claim.scanId,
        attemptId: claim.attemptId,
        workerId: claim.workerId,
        leaseToken: claim.leaseToken,
        leaseSeconds: request.leaseSeconds,
      },
      workerGateway,
    );
    if (!renewed.ok)
      return {
        ok: false,
        stage: "renew",
        queryOrdinal,
        code: renewed.code,
      };
    if (!sameLeaseIdentity(claim, renewed.lease))
      return {
        ok: false,
        stage: "renew",
        queryOrdinal,
        code: "lease_identity_mismatch",
      };

    const executed = await executeClaimedQuery(
      claim,
      queryOrdinal,
      provider,
      persistenceGateway,
      signal,
    );
    if (!executed.ok)
      return { ok: false, stage: "query", queryOrdinal, result: executed };
    observationIds.push(executed.snapshot.observationId);
  }

  return {
    ok: true,
    state: "persisted",
    workspaceId: claim.workspaceId,
    scanId: claim.scanId,
    attemptId: claim.attemptId,
    observationIds: Object.freeze(observationIds),
  };
}
