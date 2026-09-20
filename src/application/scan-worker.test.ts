import assert from "node:assert/strict";
import test from "node:test";

import {
  claimScanWork,
  MAX_SCAN_LEASE_SECONDS,
  MIN_SCAN_LEASE_SECONDS,
  renewScanWorkLease,
  retryScanWork,
  type ScanWorkerGateway,
  type ValidatedScanLeaseRequest,
  type ValidatedScanRetryRequest,
  type ValidatedScanWorkClaimRequest,
} from "./scan-worker.ts";

const workspaceId = "F2000000-0000-4000-8000-000000000001";
const scanId = "F3000000-0000-4000-8000-000000000001";
const attemptId = "F4000000-0000-4000-8000-000000000001";
const workerId = "F5000000-0000-4000-8000-000000000001";
const leaseToken = "F6000000-0000-4000-8000-000000000001";

function gateway(
  overrides: Partial<ScanWorkerGateway> = {},
): ScanWorkerGateway {
  return {
    claim: async () => ({ ok: true, claim: null }),
    renew: async () => ({ ok: false, code: "lease_not_found" }),
    retry: async () => ({ ok: false, code: "lease_not_found" }),
    ...overrides,
  };
}

test("claimScanWork normalizes worker identity and forwards bounded lease duration", async () => {
  let captured: ValidatedScanWorkClaimRequest | undefined;
  const result = await claimScanWork(
    { workerId, leaseSeconds: 60 },
    gateway({
      claim: async (request) => {
        captured = request;
        return { ok: true, claim: null };
      },
    }),
  );

  assert.deepEqual(result, { ok: true, claim: null });
  assert.deepEqual(captured, {
    workerId: workerId.toLowerCase(),
    leaseSeconds: 60,
  });
  assert.equal(Object.isFrozen(captured), true);
});

test("claimScanWork rejects invalid worker IDs and lease durations before the gateway", async () => {
  let calls = 0;
  const testGateway = gateway({
    claim: async () => {
      calls += 1;
      return { ok: true, claim: null };
    },
  });

  assert.deepEqual(
    await claimScanWork({ workerId: " bad ", leaseSeconds: 60 }, testGateway),
    { ok: false, code: "invalid_worker_id" },
  );
  for (const leaseSeconds of [
    MIN_SCAN_LEASE_SECONDS - 1,
    MAX_SCAN_LEASE_SECONDS + 1,
    30.5,
    "60",
  ]) {
    assert.deepEqual(
      await claimScanWork({ workerId, leaseSeconds }, testGateway),
      { ok: false, code: "invalid_lease_seconds" },
    );
  }
  assert.equal(calls, 0);
});

test("renewScanWorkLease normalizes the complete lease identity", async () => {
  let captured: ValidatedScanLeaseRequest | undefined;
  const result = await renewScanWorkLease(
    {
      workspaceId,
      scanId,
      attemptId,
      workerId,
      leaseToken,
      leaseSeconds: 45,
    },
    gateway({
      renew: async (request) => {
        captured = request;
        return { ok: false, code: "lease_expired" };
      },
    }),
  );

  assert.deepEqual(result, { ok: false, code: "lease_expired" });
  assert.deepEqual(captured, {
    workspaceId: workspaceId.toLowerCase(),
    scanId: scanId.toLowerCase(),
    attemptId: attemptId.toLowerCase(),
    workerId: workerId.toLowerCase(),
    leaseToken: leaseToken.toLowerCase(),
    leaseSeconds: 45,
  });
  assert.equal(Object.isFrozen(captured), true);
});

test("renewScanWorkLease rejects malformed identity fields without calling the gateway", async () => {
  let calls = 0;
  const testGateway = gateway({
    renew: async () => {
      calls += 1;
      return { ok: false, code: "database_error" };
    },
  });
  const base = {
    workspaceId,
    scanId,
    attemptId,
    workerId,
    leaseToken,
    leaseSeconds: 60,
  };
  const cases = [
    ["workspaceId", "invalid_workspace_id"],
    ["scanId", "invalid_scan_id"],
    ["attemptId", "invalid_attempt_id"],
    ["workerId", "invalid_worker_id"],
    ["leaseToken", "invalid_lease_token"],
  ] as const;

  for (const [field, code] of cases) {
    const result = await renewScanWorkLease(
      { ...base, [field]: "not-a-uuid" },
      testGateway,
    );
    assert.deepEqual(result, { ok: false, code });
  }
  assert.deepEqual(
    await renewScanWorkLease({ ...base, leaseSeconds: 301 }, testGateway),
    { ok: false, code: "invalid_lease_seconds" },
  );
  assert.equal(calls, 0);
});

test("retryScanWork forwards only the normalized lease identity", async () => {
  let captured: ValidatedScanRetryRequest | undefined;
  const result = await retryScanWork(
    { workspaceId, scanId, attemptId, workerId, leaseToken },
    gateway({
      retry: async (request) => {
        captured = request;
        return { ok: false, code: "lease_not_found" };
      },
    }),
  );

  assert.deepEqual(result, { ok: false, code: "lease_not_found" });
  assert.deepEqual(captured, {
    workspaceId: workspaceId.toLowerCase(),
    scanId: scanId.toLowerCase(),
    attemptId: attemptId.toLowerCase(),
    workerId: workerId.toLowerCase(),
    leaseToken: leaseToken.toLowerCase(),
  });
  assert.equal(Object.isFrozen(captured), true);
});

test("retryScanWork rejects invalid lease tokens before the gateway", async () => {
  let calls = 0;
  const result = await retryScanWork(
    { workspaceId, scanId, attemptId, workerId, leaseToken: "forged" },
    gateway({
      retry: async () => {
        calls += 1;
        return { ok: false, code: "database_error" };
      },
    }),
  );

  assert.deepEqual(result, { ok: false, code: "invalid_lease_token" });
  assert.equal(calls, 0);
});
