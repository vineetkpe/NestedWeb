import assert from "node:assert/strict";
import { test } from "node:test";

import type { ValidatedGroundedObservationPersistenceRequest } from "../application/grounded-observation-persistence.ts";
import { executeSupabaseGroundedObservationPersistence } from "./supabase-grounded-observation-persistence.ts";

const observationId = "e7000000-0000-4000-8000-000000000001";

const request: ValidatedGroundedObservationPersistenceRequest = Object.freeze({
  workspaceId: "e2000000-0000-4000-8000-000000000001",
  scanId: "e3000000-0000-4000-8000-000000000001",
  attemptId: "e4000000-0000-4000-8000-000000000001",
  workerId: "e5000000-0000-4000-8000-000000000001",
  leaseToken: "e6000000-0000-4000-8000-000000000001",
  queryOrdinal: 0,
  observation: Object.freeze({
    observationId,
    queryId: "niche-prompts-v1:test",
    queryVersion: "category@v1",
    queryText: "Which tools are available?",
    provider: "gemini",
    surface: "api",
    captureVersion: "gemini-generate-content-v1",
    captureMode: "injected_transport",
    requestedModel: "gemini-test-model",
    modelVersion: null,
    providerResponseId: null,
    observedAt: "2026-09-12T14:05:00.000Z",
    rawResponse: '{"fixture":true}',
    responseDigest: `sha256:${"a".repeat(64)}`,
    rawResponseState: "complete",
    outcome: "answered",
    failureCode: null,
    answerText: "Example answer",
    finishReason: "STOP",
    groundingMetadata: null,
    citations: Object.freeze([]),
  }),
});

function successData(overrides: Record<string, unknown> = {}) {
  return {
    observationId,
    state: "answered",
    citationCount: 0,
    replayed: false,
    ...overrides,
  };
}

test("sends only the lease identity and sanitized observation payload", async () => {
  let captured: unknown;
  const result = await executeSupabaseGroundedObservationPersistence(
    request,
    async (args) => {
      captured = args;
      return { data: successData(), error: null };
    },
  );

  assert.deepEqual(captured, {
    p_workspace_id: request.workspaceId,
    p_scan_id: request.scanId,
    p_attempt_id: request.attemptId,
    p_worker_id: request.workerId,
    p_lease_token: request.leaseToken,
    p_query_ordinal: 0,
    p_observation: request.observation,
  });
  assert.deepEqual(result, {
    ok: true,
    snapshot: {
      observationId,
      state: "answered",
      citationCount: 0,
      replayed: false,
    },
  });
});

test("maps explicit lease, identity and replay failures", async () => {
  const cases = [
    ["P0001", "Scan lease not found", "lease_not_found"],
    ["P0001", "Scan lease expired", "lease_expired"],
    ["22023", "Grounded observation identity mismatch", "identity_mismatch"],
    ["22023", "Raw response digest mismatch", "identity_mismatch"],
    [
      "22023",
      "Observation replay conflicts with stored evidence",
      "idempotency_conflict",
    ],
  ] as const;

  for (const [code, message, expected] of cases) {
    const result = await executeSupabaseGroundedObservationPersistence(
      request,
      async () => ({ data: null, error: { code, message } }),
    );
    assert.deepEqual(result, { ok: false, code: expected });
  }
});

test("unknown, malformed and thrown database failures fail closed", async () => {
  for (const error of [
    { code: "P0001", message: "new invariant" },
    { code: "22023", message: "Invalid grounded citation" },
    "malformed",
  ]) {
    const result = await executeSupabaseGroundedObservationPersistence(
      request,
      async () => ({ data: null, error }),
    );
    assert.deepEqual(result, { ok: false, code: "database_error" });
  }

  const thrown = await executeSupabaseGroundedObservationPersistence(
    request,
    async () => {
      throw new Error("transport failed");
    },
  );
  assert.deepEqual(thrown, { ok: false, code: "database_error" });
});

test("rejects malformed, mismatched or inconsistent success payloads", async () => {
  const invalid = [
    successData({ observationId: "not-a-uuid" }),
    successData({ observationId: "e7000000-0000-4000-8000-000000000099" }),
    successData({ state: "running" }),
    successData({ state: "failed" }),
    successData({ citationCount: -1 }),
    successData({ citationCount: 51 }),
    successData({ citationCount: 1 }),
    successData({ replayed: "false" }),
  ];

  for (const data of invalid) {
    const result = await executeSupabaseGroundedObservationPersistence(
      request,
      async () => ({ data, error: null }),
    );
    assert.deepEqual(result, {
      ok: false,
      code: "invalid_database_response",
    });
  }

  for (const response of [null, [], {}, { data: successData() }, { error: null }]) {
    const result = await executeSupabaseGroundedObservationPersistence(
      request,
      async () => response,
    );
    assert.deepEqual(result, {
      ok: false,
      code: "invalid_database_response",
    });
  }
});

test("accepts cancelled terminal state only for a cancelled failed observation", async () => {
  const cancelledRequest: ValidatedGroundedObservationPersistenceRequest = {
    ...request,
    observation: {
      ...request.observation,
      captureMode: "not_executed",
      rawResponse: null,
      responseDigest: null,
      rawResponseState: "not_received",
      outcome: "failed",
      failureCode: "cancelled",
      answerText: null,
      finishReason: null,
      citations: [],
    },
  };
  const result = await executeSupabaseGroundedObservationPersistence(
    cancelledRequest,
    async () => ({
      data: successData({ state: "cancelled" }),
      error: null,
    }),
  );
  assert.equal(result.ok, true);
});
