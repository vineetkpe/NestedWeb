import assert from "node:assert/strict";
import test from "node:test";

import type { ValidatedReserveScanRequest } from "../application/scan-reservation.ts";
import { executeSupabaseScanReservation } from "./supabase-scan-reservation.ts";

const request: ValidatedReserveScanRequest = Object.freeze({
  workspaceId: "a2000000-0000-4000-8000-000000000001",
  projectId: "a3000000-0000-4000-8000-000000000001",
  idempotencyKey: "a4000000-0000-4000-8000-000000000001",
  promptCohortId: "a5000000-0000-4000-8000-000000000001",
});

function successData(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    scanId: "A6000000-0000-4000-8000-000000000001",
    promptCohortId: request.promptCohortId,
    reservationId: "A7000000-0000-4000-8000-000000000001",
    reservedMicrounits: "400",
    currency: "USD",
    provider: "gemini",
    modelId: "gemini-test-model",
    priceVersion: "price-v1",
    maxAttempts: 2,
    maxOutputTokens: 4096,
    requestFingerprint: "a".repeat(64),
    replayed: false,
    ...overrides,
  };
}

test("executeSupabaseScanReservation sends only durable cohort identity and parses success", async () => {
  let captured: unknown;
  const result = await executeSupabaseScanReservation(request, async (args) => {
    captured = args;
    return { data: successData(), error: null };
  });

  assert.deepEqual(captured, {
    p_workspace_id: request.workspaceId,
    p_project_id: request.projectId,
    p_idempotency_key: request.idempotencyKey,
    p_prompt_cohort_id: request.promptCohortId,
  });
  assert.deepEqual(result, {
    ok: true,
    reservation: {
      scanId: "a6000000-0000-4000-8000-000000000001",
      promptCohortId: request.promptCohortId,
      reservationId: "a7000000-0000-4000-8000-000000000001",
      reservedMicrounits: "400",
      currency: "USD",
      provider: "gemini",
      modelId: "gemini-test-model",
      priceVersion: "price-v1",
      maxAttempts: 2,
      maxOutputTokens: 4096,
      requestFingerprint: "a".repeat(64),
      replayed: false,
    },
  });
  assert.equal(result.ok && Object.isFrozen(result.reservation), true);
});

test("executeSupabaseScanReservation maps the explicit database failure contract", async () => {
  const cases = [
    ["42501", "denied", "authorization_denied"],
    [
      "22023",
      "Idempotency key reused with different scan request",
      "idempotency_conflict",
    ],
    [
      "22023",
      "Idempotency key reused with different scan prompt cohort",
      "idempotency_conflict",
    ],
    ["P0001", "Scan execution unavailable", "execution_unavailable"],
    ["P0001", "Workspace budget window unavailable", "execution_unavailable"],
    ["P0001", "Project budget window unavailable", "execution_unavailable"],
    ["P0001", "Provider pricing unavailable", "execution_unavailable"],
    [
      "P0001",
      "Prompt cohort query snapshot incomplete",
      "execution_unavailable",
    ],
    [
      "P0001",
      "Existing scan lacks prompt cohort provenance",
      "execution_unavailable",
    ],
    [
      "P0001",
      "Prompt cohort has no executable queries",
      "empty_prompt_cohort",
    ],
    ["P0001", "Scan query limit exceeded", "query_limit_exceeded"],
    ["P0001", "Workspace scan concurrency exhausted", "concurrency_exhausted"],
    ["P0001", "Project scan concurrency exhausted", "concurrency_exhausted"],
    ["P0001", "Provider scan concurrency exhausted", "concurrency_exhausted"],
    [
      "P0001",
      "Workspace scan request limit exhausted",
      "request_limit_exhausted",
    ],
    [
      "P0001",
      "Project scan request limit exhausted",
      "request_limit_exhausted",
    ],
    ["P0001", "Workspace scan budget exhausted", "budget_exhausted"],
    ["P0001", "Project scan budget exhausted", "budget_exhausted"],
  ] as const;

  for (const [code, message, expected] of cases) {
    const result = await executeSupabaseScanReservation(request, async () => ({
      data: null,
      error: { code, message },
    }));
    assert.deepEqual(result, { ok: false, code: expected });
  }
});

test("executeSupabaseScanReservation treats unknown database errors as database_error", async () => {
  for (const error of [
    { code: "XX000", message: "unexpected" },
    { code: "P0001", message: "new unrecognized guard" },
    "malformed-error",
  ]) {
    const result = await executeSupabaseScanReservation(request, async () => ({
      data: null,
      error,
    }));
    assert.deepEqual(result, { ok: false, code: "database_error" });
  }
});

test("executeSupabaseScanReservation rejects malformed or mismatched success payloads", async () => {
  const invalid = [
    successData({ scanId: "not-a-uuid" }),
    successData({ promptCohortId: "not-a-uuid" }),
    successData({ promptCohortId: "a5000000-0000-4000-8000-000000000099" }),
    successData({ reservationId: "not-a-uuid" }),
    successData({ reservedMicrounits: "0" }),
    successData({ reservedMicrounits: 400 }),
    successData({ currency: "usd" }),
    successData({ provider: "other" }),
    successData({ modelId: " model " }),
    successData({ priceVersion: "" }),
    successData({ maxAttempts: 0 }),
    successData({ maxAttempts: 11 }),
    successData({ maxOutputTokens: 0 }),
    successData({ requestFingerprint: "A".repeat(64) }),
    successData({ requestFingerprint: "a".repeat(63) }),
    successData({ replayed: "false" }),
  ];

  for (const data of invalid) {
    const result = await executeSupabaseScanReservation(request, async () => ({
      data,
      error: null,
    }));
    assert.deepEqual(result, {
      ok: false,
      code: "invalid_database_response",
    });
  }
});

test("executeSupabaseScanReservation rejects malformed envelopes", async () => {
  for (const response of [
    null,
    [],
    "response",
    { data: successData() },
    { error: null },
  ]) {
    const result = await executeSupabaseScanReservation(
      request,
      async () => response,
    );
    assert.deepEqual(result, {
      ok: false,
      code: "invalid_database_response",
    });
  }
});

test("executeSupabaseScanReservation maps thrown RPC failures to database_error", async () => {
  const result = await executeSupabaseScanReservation(request, async () => {
    throw new Error("transport failed");
  });
  assert.deepEqual(result, { ok: false, code: "database_error" });
});
