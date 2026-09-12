import assert from "node:assert/strict";
import { test } from "node:test";

import type { ValidatedScanCompletionRequest } from "../application/scan-completion.ts";
import { executeSupabaseScanCompletion } from "./supabase-scan-completion.ts";

const request: ValidatedScanCompletionRequest = Object.freeze({
  workspaceId: "a2000000-0000-4000-8000-000000000001",
  scanId: "a4000000-0000-4000-8000-000000000001",
  attemptId: "a4100000-0000-4000-8000-000000000001",
  workerId: "a5000000-0000-4000-8000-000000000001",
  leaseToken: "a6000000-0000-4000-8000-000000000001",
});

function successData(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: request.workspaceId,
    scanId: request.scanId,
    attemptId: request.attemptId,
    state: "completed",
    reservationStatus: "settled",
    settledMicrounits: "26",
    costBasis: "gross_list_price",
    replayed: false,
    ...overrides,
  };
}

test("sends only lease identity and accepts consistent completion", async () => {
  let captured: unknown;
  const result = await executeSupabaseScanCompletion(request, async (args) => {
    captured = args;
    return { data: successData(), error: null };
  });
  assert.deepEqual(captured, {
    p_workspace_id: request.workspaceId,
    p_scan_id: request.scanId,
    p_attempt_id: request.attemptId,
    p_worker_id: request.workerId,
    p_lease_token: request.leaseToken,
  });
  assert.deepEqual(result, {
    ok: true,
    completion: successData(),
  });
});

test("maps explicit lease, evidence, metering and cost failures", async () => {
  const cases = [
    ["P0001", "Scan lease not found", "lease_not_found"],
    ["P0001", "Scan lease expired", "lease_expired"],
    ["P0001", "Scan evidence incomplete", "evidence_incomplete"],
    ["P0001", "Provider metering unavailable", "metering_unavailable"],
    ["22023", "Invalid Gemini usage metadata", "invalid_metering"],
    ["22023", "Invalid Gemini search usage metadata", "invalid_metering"],
    ["22023", "Metered observation identity mismatch", "invalid_metering"],
    ["22023", "Metered cost exceeds reserved worst case", "cost_exceeded"],
    ["22023", "Metered cost exceeds reservation", "cost_exceeded"],
  ] as const;
  for (const [code, message, expected] of cases) {
    const result = await executeSupabaseScanCompletion(request, async () => ({
      data: null,
      error: { code, message },
    }));
    assert.deepEqual(result, { ok: false, code: expected });
  }
});

test("unknown or malformed database results fail closed", async () => {
  for (const response of [
    null,
    [],
    {},
    { data: successData() },
    { error: null },
    { data: null, error: "bad" },
    { data: null, error: { code: "P0001", message: "new invariant" } },
  ]) {
    const result = await executeSupabaseScanCompletion(
      request,
      async () => response,
    );
    assert.equal(result.ok, false);
  }
});

test("rejects inconsistent success payloads", async () => {
  const invalid = [
    successData({ workspaceId: "a2000000-0000-4000-8000-000000000099" }),
    successData({ scanId: "bad" }),
    successData({ attemptId: "a4100000-0000-4000-8000-000000000099" }),
    successData({ state: "failed" }),
    successData({ reservationStatus: "reserved" }),
    successData({ settledMicrounits: "-1" }),
    successData({ settledMicrounits: "9223372036854775808" }),
    successData({ reservationStatus: "released", settledMicrounits: "1" }),
    successData({ reservationStatus: "settled", settledMicrounits: "0" }),
    successData({ costBasis: "invoice_exact" }),
    successData({ replayed: "false" }),
  ];
  for (const data of invalid) {
    const result = await executeSupabaseScanCompletion(
      request,
      async () => ({ data, error: null }),
    );
    assert.deepEqual(result, {
      ok: false,
      code: "invalid_database_response",
    });
  }
});
