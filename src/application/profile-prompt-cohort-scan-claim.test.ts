import assert from "node:assert/strict";
import { test } from "node:test";

import type { CompanyProfilePersistenceGateway } from "./company-profile-persistence.ts";
import {
  persistProfilePromptCohortReserveClaimScan,
  type PersistProfilePromptCohortReserveClaimScanRequest,
} from "./profile-prompt-cohort-scan-claim.ts";
import type { PromptCohortPersistenceGateway } from "./prompt-cohort-persistence.ts";
import type { ScanReservationGateway } from "./scan-reservation.ts";
import type { ScanWorkClaim } from "./scan-worker.ts";
import {
  claimTargetedScanWork,
  type TargetedScanClaimGateway,
  type ValidatedTargetedScanClaimRequest,
} from "./targeted-scan-claim.ts";

const workspaceId = "a2000000-0000-4000-8000-000000000001";
const projectId = "a3000000-0000-4000-8000-000000000001";
const profileIdempotencyKey = "a4000000-0000-4000-8000-000000000001";
const promptCohortIdempotencyKey = "a5000000-0000-4000-8000-000000000001";
const reservationIdempotencyKey = "a6000000-0000-4000-8000-000000000001";
const profileSnapshotId = "a7000000-0000-4000-8000-000000000001";
const cohortId = "a8000000-0000-4000-8000-000000000001";
const scanId = "a9000000-0000-4000-8000-000000000001";
const reservationId = "aa000000-0000-4000-8000-000000000001";
const workerId = "ab000000-0000-4000-8000-000000000001";
const attemptId = "ac000000-0000-4000-8000-000000000001";
const leaseToken = "ad000000-0000-4000-8000-000000000001";
const observationId = "ae000000-0000-4000-8000-000000000001";

function request(): PersistProfilePromptCohortReserveClaimScanRequest {
  return {
    workspaceId,
    projectId,
    profileIdempotencyKey,
    promptCohortIdempotencyKey,
    reservationIdempotencyKey,
    capturedAt: "2026-09-13T11:15:00.000Z",
    crawlResult: {
      ok: true,
      pages: [
        {
          url: "https://example.com/",
          sourceUrl: "https://example.com",
          title: "Example Corp",
          description: "AI visibility software",
          language: "en",
          statusCode: 200,
          markdown: [
            "# Example Corp",
            "Industry: AI visibility software",
            "Target audience: Agencies",
          ].join("\n"),
        },
      ],
    },
    workerId,
    leaseSeconds: 60,
  };
}

function profileGateway(): CompanyProfilePersistenceGateway {
  return async () => ({
    ok: true,
    snapshot: {
      snapshotId: profileSnapshotId,
      requestFingerprint: "a".repeat(64),
      reviewState: "pending_review",
      replayed: false,
    },
  });
}

function promptGateway(): PromptCohortPersistenceGateway {
  return async (value) => ({
    ok: true,
    cohort: {
      cohortId,
      profileSnapshotId: value.profileSnapshotId,
      requestFingerprint: "b".repeat(64),
      queryCount: value.prompts.length,
      replayed: false,
    },
  });
}

function reservationGateway(): ScanReservationGateway {
  return async (value) => ({
    ok: true,
    reservation: {
      scanId,
      promptCohortId: value.promptCohortId,
      reservationId,
      reservedMicrounits: "42000",
      currency: "USD",
      provider: "gemini",
      modelId: "gemini-3.8-flash",
      priceVersion: "2026-09-01",
      maxAttempts: 2,
      maxOutputTokens: 4096,
      requestFingerprint: "c".repeat(64),
      replayed: false,
    },
  });
}

function claim(overrides: Partial<ScanWorkClaim> = {}): ScanWorkClaim {
  return Object.freeze({
    workspaceId,
    scanId,
    projectId,
    reservationId,
    attemptId,
    attemptNumber: 1,
    workerId,
    leaseToken,
    leaseExpiresAt: "2026-09-13T11:16:00.000Z",
    provider: "gemini",
    modelId: "gemini-3.8-flash",
    priceVersion: "2026-09-01",
    currency: "USD",
    reservedMicrounits: "42000",
    maxAttempts: 2,
    maxOutputTokens: 4096,
    queries: Object.freeze([
      Object.freeze({
        queryOrdinal: 0,
        queryId: "niche-prompts-v1:test:0",
        queryVersion: "category@v1",
        queryText: "What are the best AI visibility tools?",
        observationId,
      }),
    ]),
    ...overrides,
  });
}

test("claims only the exact durable reservation and preserves its execution snapshot", async () => {
  let targeted: ValidatedTargetedScanClaimRequest | undefined;
  const claimGateway: TargetedScanClaimGateway = async (value) => {
    targeted = value;
    return { ok: true, claim: claim() };
  };

  const result = await persistProfilePromptCohortReserveClaimScan(
    request(),
    profileGateway(),
    promptGateway(),
    reservationGateway(),
    claimGateway,
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected targeted claim success");
  assert.equal(result.state, "claimed");
  if (result.state !== "claimed") throw new Error("expected claimed state");
  assert.deepEqual(targeted, {
    workspaceId,
    projectId,
    scanId,
    reservationId,
    workerId,
    leaseSeconds: 60,
  });
  assert.equal(Object.isFrozen(targeted), true);
  assert.equal(result.claim.scanId, result.reservation.scanId);
  assert.equal(result.claim.reservationId, result.reservation.reservationId);
  assert.equal(result.claim.provider, result.reservation.provider);
  assert.equal(result.claim.modelId, result.reservation.modelId);
  assert.equal(result.claim.priceVersion, result.reservation.priceVersion);
  assert.equal(result.claim.currency, result.reservation.currency);
  assert.equal(
    result.claim.reservedMicrounits,
    result.reservation.reservedMicrounits,
  );
  assert.equal(result.claim.maxAttempts, result.reservation.maxAttempts);
  assert.equal(result.claim.maxOutputTokens, result.reservation.maxOutputTokens);
});

test("returns a safe queued state when the exact reservation is not next claimable work", async () => {
  const result = await persistProfilePromptCohortReserveClaimScan(
    request(),
    profileGateway(),
    promptGateway(),
    reservationGateway(),
    async () => ({ ok: true, claim: null }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected queued success");
  assert.equal(result.state, "queued");
  assert.equal(result.reservation.scanId, scanId);
  assert.equal(result.reservation.reservationId, reservationId);
});

test("upstream failures never reach targeted claim", async () => {
  let claimCalls = 0;
  const claimGateway: TargetedScanClaimGateway = async () => {
    claimCalls += 1;
    return { ok: true, claim: null };
  };

  const profileFailure = await persistProfilePromptCohortReserveClaimScan(
    request(),
    async () => ({ ok: false, code: "database_error" }),
    promptGateway(),
    reservationGateway(),
    claimGateway,
  );
  assert.equal(profileFailure.ok, false);

  const reservationFailure = await persistProfilePromptCohortReserveClaimScan(
    request(),
    profileGateway(),
    promptGateway(),
    async () => ({ ok: false, code: "budget_exhausted" }),
    claimGateway,
  );
  assert.deepEqual(reservationFailure, {
    ok: false,
    stage: "reservation",
    failure: { ok: false, code: "budget_exhausted" },
  });
  assert.equal(claimCalls, 0);
});

test("targeted claim boundary rejects a returned claim with changed durable identity", async () => {
  const result = await claimTargetedScanWork(
    {
      workspaceId,
      projectId,
      scanId,
      reservationId,
      workerId,
      leaseSeconds: 60,
    },
    async () => ({
      ok: true,
      claim: claim({ scanId: "a9000000-0000-4000-8000-000000000099" }),
    }),
  );

  assert.deepEqual(result, { ok: false, code: "claim_identity_mismatch" });
});

test("reservation execution snapshot mismatch fails closed at claim stage", async () => {
  const result = await persistProfilePromptCohortReserveClaimScan(
    request(),
    profileGateway(),
    promptGateway(),
    reservationGateway(),
    async () => ({
      ok: true,
      claim: claim({ reservedMicrounits: "42001" }),
    }),
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "claim",
    failure: { ok: false, code: "reservation_claim_mismatch" },
  });
});
