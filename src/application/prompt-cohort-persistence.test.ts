import assert from "node:assert/strict";
import { test } from "node:test";

import {
  persistPromptCohort,
  type PromptCohortPersistenceGateway,
  type ValidatedPromptCohortPersistenceRequest,
} from "./prompt-cohort-persistence.ts";

const workspaceId = "d2000000-0000-4000-8000-000000000001";
const projectId = "d3000000-0000-4000-8000-000000000001";
const profileSnapshotId = "d4000000-0000-4000-8000-000000000001";
const idempotencyKey = "d5000000-0000-4000-8000-000000000001";

function evidence(quote: string, start: number) {
  return {
    pageIndex: 0,
    pageUrl: "https://example.com/",
    contentField: "markdown",
    start,
    end: start + quote.length,
    quote,
  };
}

function unknownField() {
  return { status: "unknown", reason: "no_supported_statement" };
}

function profile() {
  return {
    methodVersion: "company-profile-v2",
    fields: {
      companyName: unknownField(),
      productName: unknownField(),
      shortDescription: unknownField(),
      primaryProduct: unknownField(),
      targetAudience: {
        status: "confirmed",
        values: [
          {
            value: "Agencies",
            evidence: [evidence("Target audience: Agencies", 35)],
          },
        ],
      },
      industry: {
        status: "confirmed",
        values: [
          {
            value: "AI visibility software",
            evidence: [evidence("Industry: AI visibility software", 0)],
          },
        ],
      },
      keyUseCases: unknownField(),
      capabilities: unknownField(),
      geography: unknownField(),
    },
    excludedPages: [],
  };
}

function sparseProfile() {
  return {
    methodVersion: "company-profile-v2",
    fields: {
      companyName: unknownField(),
      productName: unknownField(),
      shortDescription: unknownField(),
      primaryProduct: unknownField(),
      targetAudience: unknownField(),
      industry: unknownField(),
      keyUseCases: unknownField(),
      capabilities: unknownField(),
      geography: unknownField(),
    },
    excludedPages: [],
  };
}

function request(profileValue: unknown = profile()) {
  return {
    workspaceId,
    projectId,
    profileSnapshotId,
    idempotencyKey,
    profile: profileValue,
  };
}

function gateway(
  inspect?: (value: ValidatedPromptCohortPersistenceRequest) => void,
): PromptCohortPersistenceGateway {
  return async (value) => {
    inspect?.(value);
    return {
      ok: true,
      cohort: {
        cohortId: "d6000000-0000-4000-8000-000000000001",
        profileSnapshotId: value.profileSnapshotId,
        requestFingerprint: "a".repeat(64),
        queryCount: value.prompts.length,
        replayed: false,
      },
    };
  };
}

test("recomputes and snapshots the exact deterministic prompt cohort", async () => {
  let captured: ValidatedPromptCohortPersistenceRequest | undefined;
  const input = {
    ...request(),
    prompts: [{ queryId: "forged", text: "forged" }],
  };
  const result = await persistPromptCohort(
    input as Parameters<typeof persistPromptCohort>[0] & { prompts: unknown },
    gateway((value) => {
      captured = value;
    }),
  );

  assert.equal(result.ok, true);
  assert.ok(captured);
  assert.equal(captured.workspaceId, workspaceId);
  assert.equal(captured.projectId, projectId);
  assert.equal(captured.profileSnapshotId, profileSnapshotId);
  assert.equal(captured.idempotencyKey, idempotencyKey);
  assert.equal(captured.promptMethodVersion, "niche-prompts-v1");
  assert.equal(captured.profileMethodVersion, "company-profile-v2");
  assert.equal(captured.language, "en");
  assert.equal(captured.locale, null);
  assert.equal(captured.prompts.length, 3);
  assert.deepEqual(
    captured.prompts.map((prompt) => ({
      category: prompt.category,
      templateVersion: prompt.templateVersion,
      text: prompt.text,
      language: prompt.language,
      locale: prompt.locale,
      state: prompt.state,
      evidenceRefs: prompt.evidenceRefs,
    })),
    [
      {
        category: "category-discovery",
        templateVersion: "category@v1",
        text: "Which tools are available for AI visibility software?",
        language: "en",
        locale: null,
        state: "planned",
        evidenceRefs: [
          { field: "industry", valueIndex: 0, evidenceIndexes: [0] },
        ],
      },
      {
        category: "best-tools-platforms",
        templateVersion: "best-audience@v1",
        text: "What are the best AI visibility software tools for Agencies?",
        language: "en",
        locale: null,
        state: "planned",
        evidenceRefs: [
          { field: "industry", valueIndex: 0, evidenceIndexes: [0] },
          { field: "targetAudience", valueIndex: 0, evidenceIndexes: [0] },
        ],
      },
      {
        category: "buyer-intent",
        templateVersion: "buyer@v1",
        text: "What should Agencies look for in AI visibility software tools?",
        language: "en",
        locale: null,
        state: "planned",
        evidenceRefs: [
          { field: "industry", valueIndex: 0, evidenceIndexes: [0] },
          { field: "targetAudience", valueIndex: 0, evidenceIndexes: [0] },
        ],
      },
    ],
  );
  assert.equal(Object.hasOwn(captured, "promptsFromCaller"), false);
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured.prompts), true);
  assert.equal(Object.isFrozen(captured.prompts[0]), true);
  assert.equal(Object.isFrozen(captured.prompts[0]?.evidenceRefs ?? []), true);
});

test("persists a valid zero-query cohort for a sparse profile", async () => {
  let captured: ValidatedPromptCohortPersistenceRequest | undefined;
  const result = await persistPromptCohort(
    request(sparseProfile()),
    gateway((value) => {
      captured = value;
    }),
  );

  assert.equal(result.ok, true);
  assert.ok(captured);
  assert.deepEqual(captured.prompts, []);
});

test("rejects malformed identities before persistence", async () => {
  const cases = [
    ["workspaceId", "invalid_workspace_id"],
    ["projectId", "invalid_project_id"],
    ["profileSnapshotId", "invalid_profile_snapshot_id"],
    ["idempotencyKey", "invalid_idempotency_key"],
  ] as const;

  for (const [field, code] of cases) {
    let calls = 0;
    const input = { ...request(), [field]: "not-a-uuid" };
    const result = await persistPromptCohort(input, async () => {
      calls += 1;
      return { ok: false, code: "database_error" };
    });
    assert.deepEqual(result, { ok: false, code });
    assert.equal(calls, 0);
  }
});

test("rejects unsupported or malformed profiles before persistence", async () => {
  let calls = 0;
  const result = await persistPromptCohort(
    request({ ...profile(), methodVersion: "company-profile-v1" }),
    async () => {
      calls += 1;
      return { ok: false, code: "database_error" };
    },
  );

  assert.deepEqual(result, { ok: false, code: "invalid_profile" });
  assert.equal(calls, 0);
});

test("preserves typed persistence failures", async () => {
  const failures = [
    "profile_snapshot_not_found",
    "profile_snapshot_mismatch",
    "idempotency_conflict",
    "database_error",
    "invalid_database_response",
  ] as const;

  for (const code of failures) {
    const result = await persistPromptCohort(request(), async () => ({
      ok: false,
      code,
    }));
    assert.deepEqual(result, { ok: false, code });
  }
});
