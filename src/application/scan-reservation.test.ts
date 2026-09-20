import assert from "node:assert/strict";
import test from "node:test";

import {
  reserveScan,
  type ScanReservationGateway,
  type ValidatedReserveScanRequest,
} from "./scan-reservation.ts";

const workspaceId = "A2000000-0000-4000-8000-000000000001";
const projectId = "A3000000-0000-4000-8000-000000000001";
const idempotencyKey = "A4000000-0000-4000-8000-000000000001";
const promptCohortId = "A5000000-0000-4000-8000-000000000001";

function request(): Record<string, unknown> {
  return {
    workspaceId,
    projectId,
    idempotencyKey,
    promptCohortId,
    promptGeneration: {
      ok: true,
      prompts: [{ queryId: "caller-must-not-control-scan-queries" }],
    },
  };
}

test("reserveScan normalizes only tenant, idempotency and durable cohort identity", async () => {
  let captured: ValidatedReserveScanRequest | undefined;
  const gateway: ScanReservationGateway = async (validated) => {
    captured = validated;
    return { ok: false, code: "execution_unavailable" };
  };

  const result = await reserveScan(request() as never, gateway);

  assert.deepEqual(result, { ok: false, code: "execution_unavailable" });
  assert.deepEqual(captured, {
    workspaceId: workspaceId.toLowerCase(),
    projectId: projectId.toLowerCase(),
    idempotencyKey: idempotencyKey.toLowerCase(),
    promptCohortId: promptCohortId.toLowerCase(),
  });
  assert.ok(captured);
  assert.equal(Object.hasOwn(captured, "promptGeneration"), false);
  assert.equal(Object.isFrozen(captured), true);
});

test("reserveScan rejects malformed UUIDs before the gateway", async () => {
  for (const [field, code] of [
    ["workspaceId", "invalid_workspace_id"],
    ["projectId", "invalid_project_id"],
    ["idempotencyKey", "invalid_idempotency_key"],
    ["promptCohortId", "invalid_prompt_cohort_id"],
  ] as const) {
    let calls = 0;
    const input = { ...request(), [field]: " not-a-uuid " };
    const result = await reserveScan(input as never, async () => {
      calls += 1;
      return { ok: false, code: "database_error" };
    });
    assert.deepEqual(result, { ok: false, code });
    assert.equal(calls, 0);
  }
});

test("reserveScan preserves typed gateway failures", async () => {
  const expected = [
    "authorization_denied",
    "idempotency_conflict",
    "execution_unavailable",
    "empty_prompt_cohort",
    "query_limit_exceeded",
    "concurrency_exhausted",
    "request_limit_exhausted",
    "budget_exhausted",
    "database_error",
    "invalid_database_response",
  ] as const;

  for (const code of expected) {
    const result = await reserveScan(request() as never, async () => ({
      ok: false,
      code,
    }));
    assert.deepEqual(result, { ok: false, code });
  }
});
