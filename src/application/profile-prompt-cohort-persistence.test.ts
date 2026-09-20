import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  CompanyProfilePersistenceGateway,
  ValidatedCompanyProfilePersistenceRequest,
} from "./company-profile-persistence.ts";
import {
  persistProfilePromptCohort,
  type PersistProfilePromptCohortRequest,
} from "./profile-prompt-cohort-persistence.ts";
import type {
  PromptCohortPersistenceGateway,
  ValidatedPromptCohortPersistenceRequest,
} from "./prompt-cohort-persistence.ts";

const workspaceId = "e2000000-0000-4000-8000-000000000001";
const projectId = "e3000000-0000-4000-8000-000000000001";
const profileIdempotencyKey = "e4000000-0000-4000-8000-000000000001";
const promptCohortIdempotencyKey = "e5000000-0000-4000-8000-000000000001";
const profileSnapshotId = "e6000000-0000-4000-8000-000000000001";
const cohortId = "e7000000-0000-4000-8000-000000000001";
const capturedAt = "2026-09-13T08:30:00.000Z";

function request(): PersistProfilePromptCohortRequest {
  return {
    workspaceId,
    projectId,
    profileIdempotencyKey,
    promptCohortIdempotencyKey,
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

test("hands the exact persisted profile and snapshot into prompt-cohort persistence", async () => {
  let persistedProfile: ValidatedCompanyProfilePersistenceRequest | undefined;
  let persistedCohort: ValidatedPromptCohortPersistenceRequest | undefined;

  const result = await persistProfilePromptCohort(
    request(),
    profileGateway((value) => {
      persistedProfile = value;
    }),
    promptGateway((value) => {
      persistedCohort = value;
    }),
  );

  assert.equal(result.ok, true);
  assert.ok(persistedProfile);
  assert.ok(persistedCohort);
  if (!result.ok) throw new Error("expected persistence success");

  assert.strictEqual(persistedCohort.profile, persistedProfile.profile);
  assert.strictEqual(result.profile.profile, persistedProfile.profile);
  assert.equal(persistedCohort.profileSnapshotId, profileSnapshotId);
  assert.equal(result.profile.snapshot.snapshotId, profileSnapshotId);
  assert.equal(result.cohort.cohortId, cohortId);
  assert.equal(persistedProfile.workspaceId, workspaceId);
  assert.equal(persistedProfile.projectId, projectId);
  assert.equal(persistedProfile.idempotencyKey, profileIdempotencyKey);
  assert.equal(persistedCohort.workspaceId, workspaceId);
  assert.equal(persistedCohort.projectId, projectId);
  assert.equal(persistedCohort.idempotencyKey, promptCohortIdempotencyKey);
});

test("profile-stage failure prevents prompt-cohort persistence", async () => {
  let promptCalls = 0;
  const result = await persistProfilePromptCohort(
    request(),
    async () => ({ ok: false, code: "idempotency_conflict" }),
    async () => {
      promptCalls += 1;
      return { ok: false, code: "database_error" };
    },
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "profile",
    failure: { ok: false, code: "idempotency_conflict" },
  });
  assert.equal(promptCalls, 0);
});

test("prompt-cohort failures remain typed and stage-identifiable", async () => {
  const result = await persistProfilePromptCohort(
    request(),
    profileGateway(),
    async () => ({ ok: false, code: "profile_snapshot_mismatch" }),
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "prompt_cohort",
    failure: { ok: false, code: "profile_snapshot_mismatch" },
  });
});
