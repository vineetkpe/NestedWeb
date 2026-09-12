import type {
  GroundedAIProvider,
  GroundedQueryResponse,
} from "./grounded-ai-provider.ts";
import {
  persistGroundedObservation,
  type GroundedObservationPersistenceGateway,
  type GroundedObservationSnapshotSummary,
  type PersistGroundedObservationResult,
} from "./grounded-observation-persistence.ts";
import type { ScanWorkClaim } from "./scan-worker.ts";

export type ExecuteClaimedQueryResult =
  | Readonly<{
      ok: true;
      snapshot: GroundedObservationSnapshotSummary;
    }>
  | Readonly<{
      ok: false;
      stage: "claim";
      code: "invalid_query_ordinal" | "live_provider_required";
    }>
  | Readonly<{
      ok: false;
      stage: "provider";
      code: "invalid_request" | "invalid_clock" | "provider_exception" | "identity_mismatch";
    }>
  | Readonly<{
      ok: false;
      stage: "persistence";
      code: Exclude<PersistGroundedObservationResult, { ok: true }>["code"];
    }>;

function sameProviderIdentity(
  response: Extract<GroundedQueryResponse, { ok: true }>,
  query: ScanWorkClaim["queries"][number],
): boolean {
  const observation = response.observation;
  return (
    observation.observationId === query.observationId &&
    observation.queryId === query.queryId &&
    observation.queryVersion === query.queryVersion &&
    observation.queryText === query.queryText
  );
}

/**
 * Executes exactly one query from an already-authorized database work claim.
 * This function does not claim work, renew/retry leases, complete scans or settle cost.
 */
export async function executeClaimedQuery(
  claim: ScanWorkClaim,
  queryOrdinal: number,
  provider: GroundedAIProvider,
  persistenceGateway: GroundedObservationPersistenceGateway,
  signal?: AbortSignal,
): Promise<ExecuteClaimedQueryResult> {
  if (
    !Number.isSafeInteger(queryOrdinal) ||
    queryOrdinal < 0 ||
    queryOrdinal >= claim.queries.length
  )
    return { ok: false, stage: "claim", code: "invalid_query_ordinal" };

  if (!provider.capabilities.liveExecution)
    return { ok: false, stage: "claim", code: "live_provider_required" };

  const query = claim.queries[queryOrdinal];
  if (!query || query.queryOrdinal !== queryOrdinal)
    return { ok: false, stage: "claim", code: "invalid_query_ordinal" };

  let response: GroundedQueryResponse;
  try {
    response = await provider.query(
      {
        observationId: query.observationId,
        queryId: query.queryId,
        queryVersion: query.queryVersion,
        queryText: query.queryText,
      },
      signal,
    );
  } catch {
    return { ok: false, stage: "provider", code: "provider_exception" };
  }

  if (!response.ok)
    return { ok: false, stage: "provider", code: response.code };
  if (!sameProviderIdentity(response, query))
    return { ok: false, stage: "provider", code: "identity_mismatch" };

  const persisted = await persistGroundedObservation(
    {
      workspaceId: claim.workspaceId,
      scanId: claim.scanId,
      attemptId: claim.attemptId,
      workerId: claim.workerId,
      leaseToken: claim.leaseToken,
      queryOrdinal,
      observation: response.observation,
    },
    persistenceGateway,
  );

  return persisted.ok
    ? { ok: true, snapshot: persisted.snapshot }
    : { ok: false, stage: "persistence", code: persisted.code };
}
