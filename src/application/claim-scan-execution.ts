import type { GroundedAIProvider } from "./grounded-ai-provider.ts";
import {
  executeClaimedQuery,
  type ExecuteClaimedQueryResult,
} from "./execute-claimed-query.ts";
import type { GroundedObservationPersistenceGateway } from "./grounded-observation-persistence.ts";
import {
  completeScanWork,
  type CompleteScanWorkResult,
  type ScanCompletionGateway,
  type ScanCompletionSummary,
} from "./scan-completion.ts";
import {
  claimScanWork,
  renewScanWorkLease,
  retryScanWork,
  type ScanLeaseResult,
  type ScanRetryResult,
  type ScanRetrySummary,
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
      ok: true;
      state: "completed" | "partial";
      workspaceId: string;
      scanId: string;
      attemptId: string;
      observationIds: readonly string[];
      completion: ScanCompletionSummary;
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
    }>
  | Readonly<{
      ok: false;
      stage: "observation";
      queryOrdinal: number;
      observationId: string;
      state: "failed" | "cancelled";
      retry: ScanRetrySummary;
    }>
  | Readonly<{
      ok: false;
      stage: "retry";
      queryOrdinal: number;
      observationId: string;
      state: "failed" | "cancelled";
      code: Exclude<ScanRetryResult, { ok: true }>["code"];
    }>
  | Readonly<{
      ok: false;
      stage: "completion";
      code: Exclude<CompleteScanWorkResult, { ok: true }>["code"];
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
 * Durable failed/cancelled observations stop the attempt and enter the existing
 * database retry contract before any later query can execute. When a completion
 * gateway is supplied, the database alone performs final metering/settlement and
 * releases the lease after all durable terminal evidence has been persisted.
 */
export async function claimAndExecuteScanQueries(
  request: Readonly<{
    workerId: unknown;
    leaseSeconds: unknown;
  }>,
  workerGateway: ScanWorkerGateway,
  providerFactory: ClaimedLiveProviderFactory,
  persistenceGateway: GroundedObservationPersistenceGateway,
  completionGateway?: ScanCompletionGateway,
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

    if (
      executed.snapshot.state === "failed" ||
      executed.snapshot.state === "cancelled"
    ) {
      const retry = await retryScanWork(
        {
          workspaceId: claim.workspaceId,
          scanId: claim.scanId,
          attemptId: claim.attemptId,
          workerId: claim.workerId,
          leaseToken: claim.leaseToken,
        },
        workerGateway,
      );
      if (!retry.ok)
        return {
          ok: false,
          stage: "retry",
          queryOrdinal,
          observationId: executed.snapshot.observationId,
          state: executed.snapshot.state,
          code: retry.code,
        };

      return {
        ok: false,
        stage: "observation",
        queryOrdinal,
        observationId: executed.snapshot.observationId,
        state: executed.snapshot.state,
        retry: retry.retry,
      };
    }

    observationIds.push(executed.snapshot.observationId);
  }

  const frozenObservationIds = Object.freeze(observationIds);
  if (!completionGateway)
    return {
      ok: true,
      state: "persisted",
      workspaceId: claim.workspaceId,
      scanId: claim.scanId,
      attemptId: claim.attemptId,
      observationIds: frozenObservationIds,
    };

  const completed = await completeScanWork(
    {
      workspaceId: claim.workspaceId,
      scanId: claim.scanId,
      attemptId: claim.attemptId,
      workerId: claim.workerId,
      leaseToken: claim.leaseToken,
    },
    completionGateway,
  );
  if (!completed.ok)
    return { ok: false, stage: "completion", code: completed.code };

  return {
    ok: true,
    state: completed.completion.state,
    workspaceId: claim.workspaceId,
    scanId: claim.scanId,
    attemptId: claim.attemptId,
    observationIds: frozenObservationIds,
    completion: completed.completion,
  };
}
