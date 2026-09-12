import assert from "node:assert/strict";
import test from "node:test";

import {
  reserveScan,
  type ScanReservationGateway,
  type ValidatedReserveScanRequest,
} from "./scan-reservation.ts";
import type {
  PromptCategory,
  PromptTemplateVersion,
} from "../domain/prompt-library.ts";

const workspaceId = "A2000000-0000-4000-8000-000000000001";
const projectId = "A3000000-0000-4000-8000-000000000001";
const idempotencyKey = "A4000000-0000-4000-8000-000000000001";

const categories: Readonly<Record<PromptTemplateVersion, PromptCategory>> = {
  "category@v1": "category-discovery",
  "service-area@v1": "category-discovery",
  "best-audience@v1": "best-tools-platforms",
  "alternatives@v1": "alternatives",
  "comparison-category@v1": "comparison",
  "use-case@v1": "use-case-recommendation",
  "use-case-audience@v1": "use-case-recommendation",
  "buyer@v1": "buyer-intent",
};

function queryId(version: PromptTemplateVersion, text: string): string {
  return `niche-prompts-v1:${encodeURIComponent(
    JSON.stringify([version, "en", null, text]),
  )}`;
}

function prompt(
  version: PromptTemplateVersion,
  text: string,
): Record<string, unknown> {
  return {
    queryId: queryId(version, text),
    category: categories[version],
    text,
    templateVersion: version,
    language: "en",
    locale: null,
    state: "planned",
    evidenceRefs: [{ field: "industry", valueIndex: 0, evidenceIndexes: [0] }],
  };
}

function generation(prompts: readonly unknown[]): Record<string, unknown> {
  return {
    ok: true,
    methodVersion: "niche-prompts-v1",
    profileMethodVersion: "company-profile-v2",
    prompts,
    provider: "caller-must-not-select-this",
    reservedMicrounits: "0",
  };
}

function request(promptGeneration: unknown): Record<string, unknown> {
  return {
    workspaceId,
    projectId,
    idempotencyKey,
    promptGeneration,
  };
}

test("reserveScan normalizes identities and snapshots exact ordered query identity", async () => {
  const first = prompt("category@v1", "Which tools are available?");
  const second = prompt("buyer@v1", "What should buyers look for?");
  let captured: ValidatedReserveScanRequest | undefined;
  const gateway: ScanReservationGateway = async (validated) => {
    captured = validated;
    return { ok: false, code: "execution_unavailable" };
  };

  const result = await reserveScan(
    request(generation([first, second])) as never,
    gateway,
  );

  assert.deepEqual(result, { ok: false, code: "execution_unavailable" });
  assert.ok(captured);
  assert.equal(captured.workspaceId, workspaceId.toLowerCase());
  assert.equal(captured.projectId, projectId.toLowerCase());
  assert.equal(captured.idempotencyKey, idempotencyKey.toLowerCase());
  assert.equal(captured.promptMethodVersion, "niche-prompts-v1");
  assert.equal(captured.profileMethodVersion, "company-profile-v2");
  assert.deepEqual(captured.queries, [
    {
      queryId: first.queryId,
      queryVersion: "category@v1",
      queryText: first.text,
    },
    {
      queryId: second.queryId,
      queryVersion: "buyer@v1",
      queryText: second.text,
    },
  ]);
  assert.equal(Object.hasOwn(captured, "provider"), false);
  assert.equal(Object.hasOwn(captured, "reservedMicrounits"), false);
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured.queries), true);
  assert.equal(Object.isFrozen(captured.queries[0]), true);
});

test("reserveScan rejects malformed UUIDs before the gateway", async () => {
  for (const [field, code] of [
    ["workspaceId", "invalid_workspace_id"],
    ["projectId", "invalid_project_id"],
    ["idempotencyKey", "invalid_idempotency_key"],
  ] as const) {
    let calls = 0;
    const input = request(
      generation([prompt("category@v1", "Valid question")]),
    ) as Record<string, unknown>;
    input[field] = " not-a-uuid ";
    const result = await reserveScan(input as never, async () => {
      calls += 1;
      return { ok: false, code: "database_error" };
    });
    assert.deepEqual(result, { ok: false, code });
    assert.equal(calls, 0);
  }
});

test("reserveScan rejects empty and oversized prompt cohorts", async () => {
  let calls = 0;
  const gateway: ScanReservationGateway = async () => {
    calls += 1;
    return { ok: false, code: "database_error" };
  };

  assert.deepEqual(
    await reserveScan(request(generation([])) as never, gateway),
    { ok: false, code: "invalid_prompt_cohort" },
  );
  assert.deepEqual(
    await reserveScan(
      request(
        generation(
          Array.from({ length: 11 }, (_, index) =>
            prompt("category@v1", `Question ${index}?`),
          ),
        ),
      ) as never,
      gateway,
    ),
    { ok: false, code: "too_many_prompts" },
  );
  assert.equal(calls, 0);
});

test("reserveScan rejects forged query identity, invalid version, bad text and duplicates", async () => {
  let calls = 0;
  const gateway: ScanReservationGateway = async () => {
    calls += 1;
    return { ok: false, code: "database_error" };
  };

  const forged = prompt("category@v1", "Valid question");
  forged.queryId = "niche-prompts-v1:forged";

  const invalidVersion = prompt("category@v1", "Another question");
  invalidVersion.templateVersion = "unknown@v1";

  const badText = prompt("buyer@v1", "Buyer question");
  badText.text = " ";

  const duplicate = prompt("alternatives@v1", "What are the alternatives?");

  for (const prompts of [
    [forged],
    [invalidVersion],
    [badText],
    [duplicate, { ...duplicate }],
  ]) {
    const result = await reserveScan(
      request(generation(prompts)) as never,
      gateway,
    );
    assert.deepEqual(result, { ok: false, code: "invalid_prompt_cohort" });
  }
  assert.equal(calls, 0);
});

test("reserveScan rejects malformed evidence references before reservation", async () => {
  const invalid = prompt("category@v1", "Valid question");
  invalid.evidenceRefs = [
    { field: "industry", valueIndex: 0, evidenceIndexes: [0, 0] },
  ];
  let calls = 0;
  const result = await reserveScan(
    request(generation([invalid])) as never,
    async () => {
      calls += 1;
      return { ok: false, code: "database_error" };
    },
  );
  assert.deepEqual(result, { ok: false, code: "invalid_prompt_cohort" });
  assert.equal(calls, 0);
});

test("reserveScan preserves typed gateway failures", async () => {
  const expected = [
    "authorization_denied",
    "idempotency_conflict",
    "execution_unavailable",
    "query_limit_exceeded",
    "concurrency_exhausted",
    "request_limit_exhausted",
    "budget_exhausted",
    "database_error",
    "invalid_database_response",
  ] as const;

  for (const code of expected) {
    const result = await reserveScan(
      request(generation([prompt("category@v1", "Valid question")])) as never,
      async () => ({ ok: false, code }),
    );
    assert.deepEqual(result, { ok: false, code });
  }
});
