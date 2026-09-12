import assert from "node:assert/strict";
import { test } from "node:test";

import type { ValidatedPromptCohortPersistenceRequest } from "../application/prompt-cohort-persistence.ts";
import { executeSupabasePromptCohortPersistence } from "./supabase-prompt-cohort-persistence.ts";

const request: ValidatedPromptCohortPersistenceRequest = Object.freeze({
  workspaceId: "d2000000-0000-4000-8000-000000000001",
  projectId: "d3000000-0000-4000-8000-000000000001",
  profileSnapshotId: "d4000000-0000-4000-8000-000000000001",
  idempotencyKey: "d5000000-0000-4000-8000-000000000001",
  profile: Object.freeze({ methodVersion: "company-profile-v2" }),
  promptMethodVersion: "niche-prompts-v1",
  profileMethodVersion: "company-profile-v2",
  language: "en",
  locale: null,
  prompts: Object.freeze([
    Object.freeze({
      queryId: "niche-prompts-v1:test",
      category: "category-discovery" as const,
      text: "Which tools are available?",
      templateVersion: "category@v1" as const,
      language: "en" as const,
      locale: null,
      state: "planned" as const,
      evidenceRefs: Object.freeze([
        Object.freeze({
          field: "industry" as const,
          valueIndex: 0,
          evidenceIndexes: Object.freeze([0]),
        }),
      ]),
    }),
  ]),
});

function successData(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    cohortId: "d6000000-0000-4000-8000-000000000001",
    profileSnapshotId: request.profileSnapshotId,
    requestFingerprint: "a".repeat(64),
    queryCount: 1,
    replayed: false,
    ...overrides,
  };
}

test("sends the exact persistence RPC contract and parses success", async () => {
  let captured: unknown;
  const result = await executeSupabasePromptCohortPersistence(
    request,
    async (args) => {
      captured = args;
      return { data: successData(), error: null };
    },
  );

  assert.deepEqual(captured, {
    p_workspace_id: request.workspaceId,
    p_project_id: request.projectId,
    p_profile_snapshot_id: request.profileSnapshotId,
    p_idempotency_key: request.idempotencyKey,
    p_profile: request.profile,
    p_prompts: request.prompts,
  });
  assert.deepEqual(result, {
    ok: true,
    cohort: {
      cohortId: "d6000000-0000-4000-8000-000000000001",
      profileSnapshotId: request.profileSnapshotId,
      requestFingerprint: "a".repeat(64),
      queryCount: 1,
      replayed: false,
    },
  });
});

test("maps the explicit persistence database errors", async () => {
  const cases = [
    [
      "22023",
      "Idempotency key reused with different prompt cohort",
      "idempotency_conflict",
    ],
    [
      "22023",
      "Profile payload does not match stored snapshot",
      "profile_snapshot_mismatch",
    ],
    [
      "23503",
      "Profile snapshot not found for prompt cohort",
      "profile_snapshot_not_found",
    ],
  ] as const;

  for (const [code, message, expected] of cases) {
    const result = await executeSupabasePromptCohortPersistence(
      request,
      async () => ({ data: null, error: { code, message } }),
    );
    assert.deepEqual(result, { ok: false, code: expected });
  }
});

test("unknown, malformed and thrown database failures fail closed", async () => {
  for (const error of [{ code: "XX000", message: "unexpected" }, "malformed"]) {
    const result = await executeSupabasePromptCohortPersistence(
      request,
      async () => ({ data: null, error }),
    );
    assert.deepEqual(result, { ok: false, code: "database_error" });
  }

  const thrown = await executeSupabasePromptCohortPersistence(
    request,
    async () => {
      throw new Error("transport failed");
    },
  );
  assert.deepEqual(thrown, { ok: false, code: "database_error" });
});

test("rejects malformed or mismatched success payloads", async () => {
  const invalid = [
    successData({ cohortId: "not-a-uuid" }),
    successData({ profileSnapshotId: "not-a-uuid" }),
    successData({ profileSnapshotId: "d4000000-0000-4000-8000-000000000099" }),
    successData({ requestFingerprint: "A".repeat(64) }),
    successData({ queryCount: -1 }),
    successData({ queryCount: 11 }),
    successData({ queryCount: 2 }),
    successData({ replayed: "false" }),
  ];

  for (const data of invalid) {
    const result = await executeSupabasePromptCohortPersistence(
      request,
      async () => ({ data, error: null }),
    );
    assert.deepEqual(result, {
      ok: false,
      code: "invalid_database_response",
    });
  }

  for (const response of [
    null,
    [],
    {},
    { data: successData() },
    { error: null },
  ]) {
    const result = await executeSupabasePromptCohortPersistence(
      request,
      async () => response,
    );
    assert.deepEqual(result, {
      ok: false,
      code: "invalid_database_response",
    });
  }
});
