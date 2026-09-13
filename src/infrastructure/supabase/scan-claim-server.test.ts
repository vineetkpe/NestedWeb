import assert from "node:assert/strict";
import test from "node:test";

import type { PersistProfilePromptCohortReserveClaimScanRequest } from "../../application/profile-prompt-cohort-scan-claim.ts";
import {
  claimCurrentUserReservedScan,
  executeSupabaseReservedScanClaim,
} from "./scan-claim-server.ts";

const workspaceId = "b1000000-0000-4000-8000-000000000001";
const projectId = "b2000000-0000-4000-8000-000000000001";
const profileSnapshotId = "b3000000-0000-4000-8000-000000000001";
const cohortId = "b4000000-0000-4000-8000-000000000001";
const scanId = "b5000000-0000-4000-8000-000000000001";
const reservationId = "b6000000-0000-4000-8000-000000000001";
const workerId = "b7000000-0000-4000-8000-000000000001";

function request(): PersistProfilePromptCohortReserveClaimScanRequest {
  return {
    workspaceId,
    projectId,
    profileIdempotencyKey: "b8000000-0000-4000-8000-000000000001",
    promptCohortIdempotencyKey: "b9000000-0000-4000-8000-000000000001",
    reservationIdempotencyKey: "ba000000-0000-4000-8000-000000000001",
    capturedAt: "2026-09-13T11:40:00.000Z",
    crawlResult: {
      ok: true,
      pages: [
        {
          url: "https://example.com/",
          sourceUrl: "https://example.com",
          title: "Example Corp",
          description: "AI visibility software",
          language: "en",
          statusCode: 200,
          markdown: [
            "# Example Corp",
            "Industry: AI visibility software",
            "Target audience: Agencies",
          ].join("\n"),
        },
      ],
    },
    workerId,
    leaseSeconds: 60,
  };
}

test("server composition keeps provenance and claim on service RPC while reservation uses actor RPC", async () => {
  const actorCalls: Array<{ name: string; args: unknown }> = [];
  const serviceCalls: Array<{ name: string; args: unknown }> = [];

  const result = await executeSupabaseReservedScanClaim(
    request(),
    async (name, args) => {
      actorCalls.push({ name, args });
      const reservationArgs = args as Record<string, unknown>;
      return {
        data: {
          scanId,
          promptCohortId: reservationArgs.p_prompt_cohort_id,
          reservationId,
          reservedMicrounits: "42000",
          currency: "USD",
          provider: "gemini",
          modelId: "gemini-test-model",
          priceVersion: "price-v1",
          maxAttempts: 2,
          maxOutputTokens: 4096,
          requestFingerprint: "c".repeat(64),
          replayed: false,
        },
        error: null,
      };
    },
    async (name, args) => {
      serviceCalls.push({ name, args });
      if (name === "persist_company_profile_snapshot")
        return {
          data: {
            snapshotId: profileSnapshotId,
            requestFingerprint: "a".repeat(64),
            reviewState: "pending_review",
            replayed: false,
          },
          error: null,
        };
      if (name === "persist_prompt_cohort") {
        const promptArgs = args as Record<string, unknown>;
        return {
          data: {
            cohortId,
            profileSnapshotId,
            requestFingerprint: "b".repeat(64),
            queryCount: (promptArgs.p_prompts as readonly unknown[]).length,
            replayed: false,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected bounded scan success");
  assert.equal(result.state, "queued");
  assert.deepEqual(
    actorCalls.map(({ name }) => name),
    ["reserve_scan_from_cohort"],
  );
  assert.deepEqual(
    serviceCalls.map(({ name }) => name),
    [
      "persist_company_profile_snapshot",
      "persist_prompt_cohort",
      "claim_scan_work_for_scan",
    ],
  );
  assert.equal(result.reservation.scanId, scanId);
  assert.equal(result.reservation.reservationId, reservationId);
});

test("server entry fails closed on missing or invalid secret key before request-scoped runtime", async () => {
  const missing = await claimCurrentUserReservedScan(request(), { env: {} });
  assert.deepEqual(missing, {
    ok: false,
    stage: "server_setup",
    code: "missing_supabase_secret_key",
  });

  const invalid = await claimCurrentUserReservedScan(request(), {
    env: { SUPABASE_SECRET_KEY: "not-a-secret-key" },
  });
  assert.deepEqual(invalid, {
    ok: false,
    stage: "server_setup",
    code: "invalid_supabase_secret_key",
  });
});
