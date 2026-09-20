import "server-only";

import type {
  ClaimedLiveProviderFactory,
  ClaimScanExecutionResult,
} from "../application/claim-scan-execution.ts";
import type {
  PersistProfilePromptCohortReserveClaimScanRequest,
  PersistProfilePromptCohortReserveClaimScanResult,
} from "../application/profile-prompt-cohort-scan-claim.ts";
import {
  executeSupabasePreclaimedScan,
  type SupabasePreclaimedScanRpcName,
} from "./supabase-preclaimed-scan-runner.ts";
import {
  executeSupabaseReservedScanClaim,
  type SupabaseScanClaimActorRpc,
  type SupabaseScanClaimServiceRpcName,
} from "./supabase/reserved-scan-claim-runtime.ts";

export type SupabaseBoundedScanServiceRpcName =
  SupabaseScanClaimServiceRpcName | SupabasePreclaimedScanRpcName;

export type SupabaseBoundedScanServiceRpc = (
  name: SupabaseBoundedScanServiceRpcName,
  args: unknown,
) => Promise<unknown>;

type ClaimedPreparation = Extract<
  PersistProfilePromptCohortReserveClaimScanResult,
  { ok: true; state: "claimed" }
>;

type NotClaimedPreparation = Exclude<
  PersistProfilePromptCohortReserveClaimScanResult,
  ClaimedPreparation
>;

export type ExecuteSupabaseBoundedScanResult =
  | Readonly<{
      state: "not_executed";
      preparation: NotClaimedPreparation;
      execution: null;
    }>
  | Readonly<{
      state: "execution_attempted";
      preparation: ClaimedPreparation;
      execution: ClaimScanExecutionResult;
    }>;

/**
 * Composes the durable C8 preparation chain with exact-claim execution. The
 * targeted claim returned by Postgres is passed directly into the preclaimed
 * runner; this path cannot issue a global queue claim. Provider execution is
 * injected by the caller and remains separately gated by deployment code.
 */
export async function executeSupabaseBoundedScan(
  request: PersistProfilePromptCohortReserveClaimScanRequest,
  actorRpc: SupabaseScanClaimActorRpc,
  serviceRpc: SupabaseBoundedScanServiceRpc,
  providerFactory: ClaimedLiveProviderFactory,
  signal?: AbortSignal,
): Promise<ExecuteSupabaseBoundedScanResult> {
  const preparation = await executeSupabaseReservedScanClaim(
    request,
    actorRpc,
    (name, args) => serviceRpc(name, args),
  );

  if (!preparation.ok || preparation.state !== "claimed")
    return Object.freeze({
      state: "not_executed" as const,
      preparation,
      execution: null,
    });

  const execution = await executeSupabasePreclaimedScan(
    {
      claim: preparation.claim,
      leaseSeconds: request.leaseSeconds,
    },
    (name, args) => serviceRpc(name, args),
    providerFactory,
    signal,
  );

  return Object.freeze({
    state: "execution_attempted" as const,
    preparation,
    execution,
  });
}
