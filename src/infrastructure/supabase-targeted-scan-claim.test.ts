import assert from "node:assert/strict";
import test from "node:test";

import type { ValidatedTargetedScanClaimRequest } from "../application/targeted-scan-claim.ts";
import { executeSupabaseTargetedScanClaim } from "./supabase-targeted-scan-claim.ts";

const request: ValidatedTargetedScanClaimRequest = Object.freeze({
  workspaceId: "a1000000-0000-4000-8000-000000000001",
  projectId: "a2000000-0000-4000-8000-000000000001",
  scanId: "a3000000-0000-4000-8000-000000000001",
  reservationId: "a4000000-0000-4000-8000-000000000001",
  workerId: "a5000000-0000-4000-8000-000000000001",
  leaseSeconds: 60,
});

function claimData(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: request.workspaceId.toUpperCase(),
    projectId: request.projectId.toUpperCase(),
    scanId: request.scanId.toUpperCase(),
    reservationId: request.reservationId.toUpperCase(),
    attemptId: "A6000000-0000-4000-8000-000000000001",
    attemptNumber: 1,
    workerId: request.workerId.toUpperCase(),
    leaseToken: "A7000000-0000-4000-8000-000000000001",
    leaseExpiresAt: "2026-09-13T12:00:00Z",
    provider: "gemini",
    modelId: "gemini-test-model",
    priceVersion: "price-v1",
    currency: "USD",
    reservedMicrounits: "42000",
    maxAttempts: 2,
    maxOutputTokens: 4096,
    queries: [
      {
        queryOrdinal: 0,
        queryId: "niche-prompts-v1:test:0",
        queryVersion: "category@v1",
        queryText: "Which AI visibility tools are available?",
        observationId: "A8000000-0000-4000-8000-000000000001",
      },
    ],
    ...overrides,
  };
}

test("targeted adapter sends only exact targeted RPC fields and reuses strict claim parsing", async () => {
  let captured: unknown;
  const result = await executeSupabaseTargetedScanClaim(request, async (args) => {
    captured = args;
    return { data: claimData(), error: null };
  });

  assert.deepEqual(captured, {
    p_workspace_id: request.workspaceId,
    p_project_id: request.projectId,
    p_scan_id: request.scanId,
    p_reservation_id: request.reservationId,
    p_worker_id: request.workerId,
    p_lease_seconds: request.leaseSeconds,
  });
  assert.equal(result.ok, true);
  if (!result.ok || result.claim === null) throw new Error("expected claim");
  assert.equal(result.claim.workspaceId, request.workspaceId);
  assert.equal(result.claim.projectId, request.projectId);
  assert.equal(result.claim.scanId, request.scanId);
  assert.equal(result.claim.reservationId, request.reservationId);
  assert.equal(result.claim.workerId, request.workerId);
  assert.equal(Object.isFrozen(result.claim), true);
});

test("targeted adapter preserves safe null claim and fails closed on malformed evidence", async () => {
  const queued = await executeSupabaseTargetedScanClaim(request, async () => ({
    data: null,
    error: null,
  }));
  assert.deepEqual(queued, { ok: true, claim: null });

  const malformed = await executeSupabaseTargetedScanClaim(
    request,
    async () => ({
      data: claimData({ queries: [] }),
      error: null,
    }),
  );
  assert.deepEqual(malformed, {
    ok: false,
    code: "invalid_database_response",
  });

  const thrown = await executeSupabaseTargetedScanClaim(request, async () => {
    throw new Error("transport failed");
  });
  assert.deepEqual(thrown, { ok: false, code: "database_error" });
});
