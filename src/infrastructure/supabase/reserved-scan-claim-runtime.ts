import "server-only";

import {
  persistProfilePromptCohortReserveClaimScan,
  type PersistProfilePromptCohortReserveClaimScanRequest,
  type PersistProfilePromptCohortReserveClaimScanResult,
} from "../../application/profile-prompt-cohort-scan-claim.ts";
import { executeSupabaseCompanyProfilePersistence } from "../supabase-company-profile-persistence.ts";
import { executeSupabasePromptCohortPersistence } from "../supabase-prompt-cohort-persistence.ts";
import { executeSupabaseScanReservation } from "../supabase-scan-reservation.ts";
import { executeSupabaseTargetedScanClaim } from "../supabase-targeted-scan-claim.ts";

export type SupabaseScanClaimActorRpcName = "reserve_scan_from_cohort";
export type SupabaseScanClaimServiceRpcName =
  | "persist_company_profile_snapshot"
  | "persist_prompt_cohort"
  | "claim_scan_work_for_scan";

export type SupabaseScanClaimActorRpc = (
  name: SupabaseScanClaimActorRpcName,
  args: unknown,
) => Promise<unknown>;

export type SupabaseScanClaimServiceRpc = (
  name: SupabaseScanClaimServiceRpcName,
  args: unknown,
) => Promise<unknown>;

/**
 * Request-independent Supabase composition for the durable preparation chain.
 * Service-only provenance writes and the exact targeted claim use the service
 * channel; reservation deliberately stays on the authenticated actor channel so
 * Postgres re-checks membership and budget. No request/session runtime is loaded.
 */
export async function executeSupabaseReservedScanClaim(
  request: PersistProfilePromptCohortReserveClaimScanRequest,
  actorRpc: SupabaseScanClaimActorRpc,
  serviceRpc: SupabaseScanClaimServiceRpc,
): Promise<PersistProfilePromptCohortReserveClaimScanResult> {
  return persistProfilePromptCohortReserveClaimScan(
    request,
    (validated) =>
      executeSupabaseCompanyProfilePersistence(validated, (args) =>
        serviceRpc("persist_company_profile_snapshot", args),
      ),
    (validated) =>
      executeSupabasePromptCohortPersistence(validated, (args) =>
        serviceRpc("persist_prompt_cohort", args),
      ),
    (validated) =>
      executeSupabaseScanReservation(validated, (args) =>
        actorRpc("reserve_scan_from_cohort", args),
      ),
    (validated) =>
      executeSupabaseTargetedScanClaim(validated, (args) =>
        serviceRpc("claim_scan_work_for_scan", args),
      ),
  );
}
