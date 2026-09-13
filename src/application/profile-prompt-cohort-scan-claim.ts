import type {
  CompanyProfilePersistenceGateway,
  PersistCompanyProfileSuccess,
} from "./company-profile-persistence.ts";
import {
  persistProfilePromptCohortReserveScan,
  type PersistProfilePromptCohortReserveScanResult,
} from "./profile-prompt-cohort-scan-reservation.ts";
import type {
  PromptCohortPersistenceGateway,
  PromptCohortSnapshotSummary,
} from "./prompt-cohort-persistence.ts";
import type {
  ScanReservationGateway,
  ScanReservationSummary,
} from "./scan-reservation.ts";
import type { ScanWorkClaim } from "./scan-worker.ts";
import {
  claimTargetedScanWork,
  type TargetedScanClaimGateway,
  type TargetedScanClaimResult,
} from "./targeted-scan-claim.ts";

export type PersistProfilePromptCohortReserveClaimScanRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  profileIdempotencyKey: unknown;
  promptCohortIdempotencyKey: unknown;
  reservationIdempotencyKey: unknown;
  capturedAt: unknown;
  crawlResult: unknown;
  workerId: unknown;
  leaseSeconds: unknown;
}>;

type UpstreamFailure = Extract<
  PersistProfilePromptCohortReserveScanResult,
  { ok: false }
>;

type SuccessfulState = Readonly<{
  profile: PersistCompanyProfileSuccess;
  cohort: PromptCohortSnapshotSummary;
  reservation: ScanReservationSummary;
}>;

export type PersistProfilePromptCohortReserveClaimScanResult =
  | (SuccessfulState & Readonly<{ ok: true; state: "queued" }>)
  | (SuccessfulState &
      Readonly<{ ok: true; state: "claimed"; claim: ScanWorkClaim }>)
  | UpstreamFailure
  | Readonly<{
      ok: false;
      stage: "claim";
      failure:
        | Exclude<TargetedScanClaimResult, { ok: true }>
        | Readonly<{ ok: false; code: "reservation_claim_mismatch" }>;
    }>;

function sameExecutionSnapshot(
  reservation: ScanReservationSummary,
  claim: ScanWorkClaim,
): boolean {
  return (
    claim.scanId === reservation.scanId &&
    claim.reservationId === reservation.reservationId &&
    claim.provider === reservation.provider &&
    claim.modelId === reservation.modelId &&
    claim.priceVersion === reservation.priceVersion &&
    claim.currency === reservation.currency &&
    claim.reservedMicrounits === reservation.reservedMicrounits &&
    claim.maxAttempts === reservation.maxAttempts &&
    claim.maxOutputTokens === reservation.maxOutputTokens
  );
}

/**
 * Extends the durable profile -> cohort -> reservation chain to one exact worker
 * claim. A null targeted claim is a safe queued state; no provider request is
 * made here. Any claim exposed downstream must match the immutable execution
 * snapshot returned by reservation.
 */
export async function persistProfilePromptCohortReserveClaimScan(
  request: PersistProfilePromptCohortReserveClaimScanRequest,
  profileGateway: CompanyProfilePersistenceGateway,
  promptGateway: PromptCohortPersistenceGateway,
  reservationGateway: ScanReservationGateway,
  claimGateway: TargetedScanClaimGateway,
): Promise<PersistProfilePromptCohortReserveClaimScanResult> {
  const reserved = await persistProfilePromptCohortReserveScan(
    {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      profileIdempotencyKey: request.profileIdempotencyKey,
      promptCohortIdempotencyKey: request.promptCohortIdempotencyKey,
      reservationIdempotencyKey: request.reservationIdempotencyKey,
      capturedAt: request.capturedAt,
      crawlResult: request.crawlResult,
    },
    profileGateway,
    promptGateway,
    reservationGateway,
  );
  if (!reserved.ok) return reserved;

  const claimed = await claimTargetedScanWork(
    {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      scanId: reserved.reservation.scanId,
      reservationId: reserved.reservation.reservationId,
      workerId: request.workerId,
      leaseSeconds: request.leaseSeconds,
    },
    claimGateway,
  );
  if (!claimed.ok)
    return Object.freeze({
      ok: false,
      stage: "claim",
      failure: claimed,
    });

  const success = {
    profile: reserved.profile,
    cohort: reserved.cohort,
    reservation: reserved.reservation,
  };
  if (claimed.claim === null)
    return Object.freeze({
      ok: true,
      state: "queued",
      ...success,
    });

  if (!sameExecutionSnapshot(reserved.reservation, claimed.claim))
    return Object.freeze({
      ok: false,
      stage: "claim",
      failure: {
        ok: false as const,
        code: "reservation_claim_mismatch" as const,
      },
    });

  return Object.freeze({
    ok: true,
    state: "claimed",
    ...success,
    claim: claimed.claim,
  });
}
