import type {
  CompanyProfilePersistenceGateway,
  PersistCompanyProfileSuccess,
} from "./company-profile-persistence.ts";
import {
  persistProfilePromptCohort,
  type PersistProfilePromptCohortResult,
} from "./profile-prompt-cohort-persistence.ts";
import type {
  PromptCohortPersistenceGateway,
  PromptCohortSnapshotSummary,
} from "./prompt-cohort-persistence.ts";
import {
  reserveScan,
  type ReserveScanResult,
  type ScanReservationGateway,
  type ScanReservationSummary,
} from "./scan-reservation.ts";

export type PersistProfilePromptCohortReserveScanRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  profileIdempotencyKey: unknown;
  promptCohortIdempotencyKey: unknown;
  reservationIdempotencyKey: unknown;
  capturedAt: unknown;
  crawlResult: unknown;
}>;

type UpstreamFailure = Extract<PersistProfilePromptCohortResult, { ok: false }>;

export type PersistProfilePromptCohortReserveScanResult =
  | Readonly<{
      ok: true;
      profile: PersistCompanyProfileSuccess;
      cohort: PromptCohortSnapshotSummary;
      reservation: ScanReservationSummary;
    }>
  | UpstreamFailure
  | Readonly<{
      ok: false;
      stage: "reservation";
      failure: Exclude<ReserveScanResult, { ok: true }>;
    }>;

/**
 * Extends the durable profile -> prompt-cohort chain through the existing scan
 * reservation boundary. The application supplies only the exact durable cohort
 * identity returned by persistence; query payload, provider/model, pricing,
 * limits and reserved cost remain database-authoritative.
 */
export async function persistProfilePromptCohortReserveScan(
  request: PersistProfilePromptCohortReserveScanRequest,
  profileGateway: CompanyProfilePersistenceGateway,
  promptGateway: PromptCohortPersistenceGateway,
  reservationGateway: ScanReservationGateway,
): Promise<PersistProfilePromptCohortReserveScanResult> {
  const persisted = await persistProfilePromptCohort(
    {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      profileIdempotencyKey: request.profileIdempotencyKey,
      promptCohortIdempotencyKey: request.promptCohortIdempotencyKey,
      capturedAt: request.capturedAt,
      crawlResult: request.crawlResult,
    },
    profileGateway,
    promptGateway,
  );
  if (!persisted.ok) return persisted;

  const reservation = await reserveScan(
    {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      idempotencyKey: request.reservationIdempotencyKey,
      promptCohortId: persisted.cohort.cohortId,
    },
    reservationGateway,
  );
  if (!reservation.ok) {
    return Object.freeze({
      ok: false,
      stage: "reservation",
      failure: reservation,
    });
  }

  return Object.freeze({
    ok: true,
    profile: persisted.profile,
    cohort: persisted.cohort,
    reservation: reservation.reservation,
  });
}
