import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  CompanyProfilePersistenceGateway,
  ValidatedCompanyProfilePersistenceRequest,
} from "./company-profile-persistence.ts";
import {
  persistProfilePromptCohortReserveScan,
  type PersistProfilePromptCohortReserveScanRequest,
} from "./profile-prompt-cohort-scan-reservation.ts";
import type {
  PromptCohortPersistenceGateway,
  ValidatedPromptCohortPersistenceRequest,
} from "./prompt-cohort-persistence.ts";
import type {
  ScanReservationGateway,
  ValidatedReserveScanRequest,
} from "./scan-reservation.ts";

const workspaceId = "f2000000-0000-4000-8000-000000000001";
const projectId = "f3000000-0000-4000-8000-000000000001";
const profileIdempotencyKey = "f4000000-0000-4000-8000-000000000001";
const promptCohortIdempotencyKey = "f5000000-0000-4000-8000-000000000001";
const reservationIdempotencyKey = "f6000000-0000-4000-8000-000000000001";
const profileSnapshotId = "f7000000-0000-4000-8000-000000000001";
const cohortId = "f8000000-0000-4000-8000-000000000001";
const scanId = "f9000000-0000-4000-8000-000000000001";
const reservationId = "fa000000-0000-4000-8000-000000000001";
const capturedAt = "2026-09-13T10:50:00.000Z";

function request(): PersistProfilePromptCohortReserveScanRequest {
  return {
    workspaceId,
    projectId,
    profileIdempotencyKey,
    promptCohortIdempotencyKey,
    reservationIdempotencyKey,
    capturedAt,
    crawlResult: {
      ok: true,
      pages: [
        {
          url: "https://example.com/",
          sourceUrl: "https://example.com",
          title: "Example Corp",
          description: "Example description",
          language: "en",
          statusCode: 200,
          markdown: [
            "# About us",
            "Company name: Example Corp",
            "Industry: AI visibility software",
            "Target audience: Agencies",
          ].join("\n"),
        },
      ],
    },
  };
}

function profileGateway(
  inspect?: (value: ValidatedCompanyProfilePersistenceRequest) => void,
): CompanyProfilePersistenceGateway {
  return async (value) => {
    inspect?.(value);
    return {
      ok: true,
      snapshot: {
        snapshotId: profileSnapshotId,
        requestFingerprint: "a".repeat(64),
        reviewState: "pending_review",
        replayed: false,
      },
    };
  };
}

function promptGateway(
  inspect?: (value: ValidatedPromptCohortPersistenceRequest) => void,
): PromptCohortPersistenceGateway {
  return async (value) => {
    inspect?.(value);
    return {
      ok: true,
      cohort: {
        cohortId,
        profileSnapshotId: value.profileSnapshotId,
        requestFingerprint: "b".repeat(64),
        queryCount: value.prompts.length,
        replayed: false,
      },
    };
  };
}

function reservationGateway(
  inspect?: (value: ValidatedReserveScanRequest) => void,
): ScanReservationGateway {
  return async (value) => {
    inspect?.(value);
    return {
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
    };
  };
}

test("reserves from the exact durable cohort without caller pricing or query inputs", async () => {
  let persistedProfile: ValidatedCompanyProfilePersistenceRequest | undefined;
  let persistedCohort: ValidatedPromptCohortPersistenceRequest | undefined;
  let reserved: ValidatedReserveScanRequest | undefined;

  const result = await persistProfilePromptCohortReserveScan(
    request(),
    profileGateway((value) => {
      persistedProfile = value;
    }),
    promptGateway((value) => {
      persistedCohort = value;
    }),
    reservationGateway((value) => {
      reserved = value;
    }),
  );

  assert.equal(result.ok, true);
  assert.ok(persistedProfile);
  assert.ok(persistedCohort);
  assert.ok(reserved);
  if (!result.ok) throw new Error("expected reservation success");

  assert.strictEqual(persistedCohort.profile, persistedProfile.profile);
  assert.equal(reserved.promptCohortId, cohortId);
  assert.equal(result.cohort.cohortId, cohortId);
  assert.equal(result.reservation.promptCohortId, cohortId);
  assert.deepEqual(reserved, {
    workspaceId,
    projectId,
    idempotencyKey: reservationIdempotencyKey,
    promptCohortId: cohortId,
  });
  assert.deepEqual(Object.keys(reserved).sort(), [
    "idempotencyKey",
    "projectId",
    "promptCohortId",
    "workspaceId",
  ]);
  assert.equal(Object.isFrozen(reserved), true);
});

test("upstream failures prevent scan reservation", async () => {
  let reservationCalls = 0;
  const reservation: ScanReservationGateway = async () => {
    reservationCalls += 1;
    return { ok: false, code: "database_error" };
  };

  const profileFailure = await persistProfilePromptCohortReserveScan(
    request(),
    async () => ({ ok: false, code: "idempotency_conflict" }),
    promptGateway(),
    reservation,
  );
  assert.deepEqual(profileFailure, {
    ok: false,
    stage: "profile",
    failure: { ok: false, code: "idempotency_conflict" },
  });

  const promptFailure = await persistProfilePromptCohortReserveScan(
    request(),
    profileGateway(),
    async () => ({ ok: false, code: "profile_snapshot_mismatch" }),
    reservation,
  );
  assert.deepEqual(promptFailure, {
    ok: false,
    stage: "prompt_cohort",
    failure: { ok: false, code: "profile_snapshot_mismatch" },
  });
  assert.equal(reservationCalls, 0);
});

test("reservation failures remain typed and stage-identifiable", async () => {
  const result = await persistProfilePromptCohortReserveScan(
    request(),
    profileGateway(),
    promptGateway(),
    async () => ({ ok: false, code: "budget_exhausted" }),
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "reservation",
    failure: { ok: false, code: "budget_exhausted" },
  });
});
