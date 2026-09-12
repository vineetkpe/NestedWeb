import assert from "node:assert/strict";
import test from "node:test";

import type {
  ValidatedScanLeaseRequest,
  ValidatedScanRetryRequest,
  ValidatedScanWorkClaimRequest,
} from "../application/scan-worker.ts";
import {
  executeSupabaseScanLeaseRenewal,
  executeSupabaseScanRetry,
  executeSupabaseScanWorkClaim,
} from "./supabase-scan-worker.ts";

const claimRequest: ValidatedScanWorkClaimRequest = Object.freeze({
  workerId: "f5000000-0000-4000-8000-000000000001",
  leaseSeconds: 60,
});

const leaseRequest: ValidatedScanLeaseRequest = Object.freeze({
  workspaceId: "f2000000-0000-4000-8000-000000000001",
  scanId: "f3000000-0000-4000-8000-000000000001",
  attemptId: "f4000000-0000-4000-8000-000000000001",
  workerId: "f5000000-0000-4000-8000-000000000001",
  leaseToken: "f6000000-0000-4000-8000-000000000001",
  leaseSeconds: 60,
});

const retryRequest: ValidatedScanRetryRequest = Object.freeze({
  workspaceId: leaseRequest.workspaceId,
  scanId: leaseRequest.scanId,
  attemptId: leaseRequest.attemptId,
  workerId: leaseRequest.workerId,
  leaseToken: leaseRequest.leaseToken,
});

function claimData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workspaceId: "F2000000-0000-4000-8000-000000000001",
    scanId: "F3000000-0000-4000-8000-000000000001",
    projectId: "F7000000-0000-4000-8000-000000000001",
    reservationId: "F8000000-0000-4000-8000-000000000001",
    attemptId: "F4000000-0000-4000-8000-000000000001",
    attemptNumber: 1,
    workerId: "F5000000-0000-4000-8000-000000000001",
    leaseToken: "F6000000-0000-4000-8000-000000000001",
    leaseExpiresAt: "2026-09-12T08:45:00+00:00",
    provider: "gemini",
    modelId: "gemini-test-model",
    priceVersion: "price-v1",
    currency: "USD",
    reservedMicrounits: "400",
    maxAttempts: 2,
    maxOutputTokens: 4096,
    queries: [
      {
        queryOrdinal: 0,
        queryId: "niche-prompts-v1:first",
        queryVersion: "category@v1",
        queryText: "Which tools are available?",
        observationId: "F9000000-0000-4000-8000-000000000001",
      },
      {
        queryOrdinal: 1,
        queryId: "niche-prompts-v1:second",
        queryVersion: "buyer@v1",
        queryText: "What should buyers look for?",
        observationId: "F9000000-0000-4000-8000-000000000002",
      },
    ],
    ...overrides,
  };
}

function leaseData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workspaceId: "F2000000-0000-4000-8000-000000000001",
    scanId: "F3000000-0000-4000-8000-000000000001",
    attemptId: "F4000000-0000-4000-8000-000000000001",
    workerId: "F5000000-0000-4000-8000-000000000001",
    leaseToken: "F6000000-0000-4000-8000-000000000001",
    leaseExpiresAt: "2026-09-12T08:46:00Z",
    ...overrides,
  };
}

function retryData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workspaceId: "F2000000-0000-4000-8000-000000000001",
    scanId: "F3000000-0000-4000-8000-000000000001",
    attemptId: "F4000000-0000-4000-8000-000000000001",
    attemptNumber: 1,
    maxAttempts: 2,
    nextState: "queued",
    retryScheduled: true,
    ...overrides,
  };
}

test("executeSupabaseScanWorkClaim sends only the claim RPC contract and parses a claim", async () => {
  let captured: unknown;
  const result = await executeSupabaseScanWorkClaim(claimRequest, async (args) => {
    captured = args;
    return { data: claimData(), error: null };
  });

  assert.deepEqual(captured, {
    p_worker_id: claimRequest.workerId,
    p_lease_seconds: 60,
  });
  assert.equal(result.ok, true);
  if (!result.ok || result.claim === null) return;
  assert.equal(result.claim.workspaceId, leaseRequest.workspaceId);
  assert.equal(result.claim.workerId, claimRequest.workerId);
  assert.equal(result.claim.queries.length, 2);
  assert.equal(result.claim.queries[0]?.queryOrdinal, 0);
  assert.equal(
    result.claim.queries[0]?.observationId,
    "f9000000-0000-4000-8000-000000000001",
  );
  assert.equal(Object.isFrozen(result.claim), true);
  assert.equal(Object.isFrozen(result.claim.queries), true);
  assert.equal(Object.isFrozen(result.claim.queries[0]), true);
});

test("executeSupabaseScanWorkClaim accepts an empty queue as a successful null claim", async () => {
  const result = await executeSupabaseScanWorkClaim(claimRequest, async () => ({
    data: null,
    error: null,
  }));
  assert.deepEqual(result, { ok: true, claim: null });
});

test("executeSupabaseScanWorkClaim rejects malformed or internally inconsistent claims", async () => {
  const duplicateObservation = claimData();
  duplicateObservation.queries = [
    ...(duplicateObservation.queries as Record<string, unknown>[]).slice(0, 1),
    {
      ...(duplicateObservation.queries as Record<string, unknown>[])[1],
      observationId: "F9000000-0000-4000-8000-000000000001",
    },
  ];

  const invalidClaims = [
    claimData({ leaseExpiresAt: "not-a-time" }),
    claimData({ provider: "other" }),
    claimData({ currency: "usd" }),
    claimData({ attemptNumber: 3, maxAttempts: 2 }),
    claimData({ reservedMicrounits: "0" }),
    claimData({ queries: [] }),
    claimData({
      queries: [
        {
          ...(claimData().queries as Record<string, unknown>[])[0],
          queryOrdinal: 1,
        },
      ],
    }),
    duplicateObservation,
  ];

  for (const data of invalidClaims) {
    const result = await executeSupabaseScanWorkClaim(claimRequest, async () => ({
      data,
      error: null,
    }));
    assert.deepEqual(result, {
      ok: false,
      code: "invalid_database_response",
    });
  }
});

test("executeSupabaseScanLeaseRenewal sends exact ownership fields and parses renewal", async () => {
  let captured: unknown;
  const result = await executeSupabaseScanLeaseRenewal(leaseRequest, async (args) => {
    captured = args;
    return { data: leaseData(), error: null };
  });

  assert.deepEqual(captured, {
    p_workspace_id: leaseRequest.workspaceId,
    p_scan_id: leaseRequest.scanId,
    p_attempt_id: leaseRequest.attemptId,
    p_worker_id: leaseRequest.workerId,
    p_lease_token: leaseRequest.leaseToken,
    p_lease_seconds: leaseRequest.leaseSeconds,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.lease, {
    workspaceId: leaseRequest.workspaceId,
    scanId: leaseRequest.scanId,
    attemptId: leaseRequest.attemptId,
    workerId: leaseRequest.workerId,
    leaseToken: leaseRequest.leaseToken,
    leaseExpiresAt: "2026-09-12T08:46:00Z",
  });
  assert.equal(Object.isFrozen(result.lease), true);
});

test("executeSupabaseScanRetry sends exact lease identity and enforces coherent retry state", async () => {
  let captured: unknown;
  const result = await executeSupabaseScanRetry(retryRequest, async (args) => {
    captured = args;
    return { data: retryData(), error: null };
  });

  assert.deepEqual(captured, {
    p_workspace_id: retryRequest.workspaceId,
    p_scan_id: retryRequest.scanId,
    p_attempt_id: retryRequest.attemptId,
    p_worker_id: retryRequest.workerId,
    p_lease_token: retryRequest.leaseToken,
  });
  assert.deepEqual(result, {
    ok: true,
    retry: {
      workspaceId: retryRequest.workspaceId,
      scanId: retryRequest.scanId,
      attemptId: retryRequest.attemptId,
      attemptNumber: 1,
      maxAttempts: 2,
      nextState: "queued",
      retryScheduled: true,
    },
  });

  for (const data of [
    retryData({ nextState: "queued", retryScheduled: false }),
    retryData({ nextState: "failed", retryScheduled: true }),
    retryData({ nextState: "unknown" }),
    retryData({ attemptNumber: 3, maxAttempts: 2 }),
  ]) {
    const invalid = await executeSupabaseScanRetry(retryRequest, async () => ({
      data,
      error: null,
    }));
    assert.deepEqual(invalid, {
      ok: false,
      code: "invalid_database_response",
    });
  }
});

test("scan worker adapters map lease ownership failures without leaking database details", async () => {
  for (const [message, code] of [
    ["Scan lease not found", "lease_not_found"],
    ["Scan lease expired", "lease_expired"],
  ] as const) {
    const claim = await executeSupabaseScanWorkClaim(claimRequest, async () => ({
      data: null,
      error: { code: "P0001", message },
    }));
    const renewal = await executeSupabaseScanLeaseRenewal(
      leaseRequest,
      async () => ({ data: null, error: { code: "P0001", message } }),
    );
    const retry = await executeSupabaseScanRetry(retryRequest, async () => ({
      data: null,
      error: { code: "P0001", message },
    }));
    assert.deepEqual(claim, { ok: false, code });
    assert.deepEqual(renewal, { ok: false, code });
    assert.deepEqual(retry, { ok: false, code });
  }
});

test("scan worker adapters fail closed on malformed envelopes, unknown errors and thrown transports", async () => {
  for (const response of [
    null,
    [],
    { data: claimData() },
    { error: null },
  ]) {
    const result = await executeSupabaseScanWorkClaim(
      claimRequest,
      async () => response,
    );
    assert.deepEqual(result, {
      ok: false,
      code: "invalid_database_response",
    });
  }

  const unknown = await executeSupabaseScanLeaseRenewal(
    leaseRequest,
    async () => ({
      data: null,
      error: { code: "P0001", message: "new worker invariant" },
    }),
  );
  assert.deepEqual(unknown, { ok: false, code: "database_error" });

  const thrown = await executeSupabaseScanRetry(retryRequest, async () => {
    throw new Error("transport failed");
  });
  assert.deepEqual(thrown, { ok: false, code: "database_error" });
});
