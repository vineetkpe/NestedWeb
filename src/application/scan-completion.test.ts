import assert from "node:assert/strict";
import { test } from "node:test";

import {
  completeScanWork,
  validSettledMicrounits,
  type ValidatedScanCompletionRequest,
} from "./scan-completion.ts";

const request = {
  workspaceId: "a2000000-0000-4000-8000-000000000001",
  scanId: "a4000000-0000-4000-8000-000000000001",
  attemptId: "a4100000-0000-4000-8000-000000000001",
  workerId: "a5000000-0000-4000-8000-000000000001",
  leaseToken: "a6000000-0000-4000-8000-000000000001",
};

test("validates and freezes lease identity before completion gateway", async () => {
  let captured: ValidatedScanCompletionRequest | undefined;
  const result = await completeScanWork(request, async (value) => {
    captured = value;
    return {
      ok: true,
      completion: {
        workspaceId: value.workspaceId,
        scanId: value.scanId,
        attemptId: value.attemptId,
        state: "completed",
        reservationStatus: "settled",
        settledMicrounits: "26",
        costBasis: "gross_list_price",
        replayed: false,
      },
    };
  });
  assert.equal(result.ok, true);
  assert.deepEqual(captured, request);
  assert.equal(Object.isFrozen(captured), true);
});

test("invalid identities fail before any database gateway call", async () => {
  const cases = [
    ["workspaceId", "bad", "invalid_workspace_id"],
    ["scanId", "bad", "invalid_scan_id"],
    ["attemptId", "bad", "invalid_attempt_id"],
    ["workerId", "bad", "invalid_worker_id"],
    ["leaseToken", "bad", "invalid_lease_token"],
  ] as const;
  for (const [field, value, code] of cases) {
    let calls = 0;
    const result = await completeScanWork(
      { ...request, [field]: value },
      async () => {
        calls += 1;
        return { ok: false, code: "database_error" };
      },
    );
    assert.deepEqual(result, { ok: false, code });
    assert.equal(calls, 0);
  }
});

test("settled microunit parser accepts only PostgreSQL bigint text", () => {
  for (const value of ["0", "1", "26", "9223372036854775807"])
    assert.equal(validSettledMicrounits(value), true);
  for (const value of [
    "",
    "01",
    "-1",
    "+1",
    "1.5",
    " 1",
    "9223372036854775808",
    1,
    null,
  ])
    assert.equal(validSettledMicrounits(value), false);
});

test("typed completion failures are preserved", async () => {
  const failures = [
    "lease_not_found",
    "lease_expired",
    "evidence_incomplete",
    "metering_unavailable",
    "invalid_metering",
    "cost_exceeded",
    "database_error",
    "invalid_database_response",
  ] as const;
  for (const code of failures) {
    const result = await completeScanWork(request, async () => ({
      ok: false,
      code,
    }));
    assert.deepEqual(result, { ok: false, code });
  }
});
