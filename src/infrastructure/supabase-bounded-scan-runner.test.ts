import assert from "node:assert/strict";
import test from "node:test";

import type { GroundedAIProvider } from "../application/grounded-ai-provider.ts";
import type { PersistProfilePromptCohortReserveClaimScanRequest } from "../application/profile-prompt-cohort-scan-claim.ts";
import type { RawObservation } from "../domain/raw-observation.ts";
import {
  executeSupabaseBoundedScan,
  type SupabaseBoundedScanServiceRpc,
} from "./supabase-bounded-scan-runner.ts";

const workspaceId = "c1000000-0000-4000-8000-000000000001";
const projectId = "c2000000-0000-4000-8000-000000000001";
const profileSnapshotId = "c3000000-0000-4000-8000-000000000001";
const cohortId = "c4000000-0000-4000-8000-000000000001";
const scanId = "c5000000-0000-4000-8000-000000000001";
const reservationId = "c6000000-0000-4000-8000-000000000001";
const workerId = "c7000000-0000-4000-8000-000000000001";
const attemptId = "c8000000-0000-4000-8000-000000000001";
const leaseToken = "c9000000-0000-4000-8000-000000000001";
const observationId = "ca000000-0000-4000-8000-000000000001";

function request(): PersistProfilePromptCohortReserveClaimScanRequest {
  return {
    workspaceId,
    projectId,
    profileIdempotencyKey: "cb000000-0000-4000-8000-000000000001",
    promptCohortIdempotencyKey: "cc000000-0000-4000-8000-000000000001",
    reservationIdempotencyKey: "cd000000-0000-4000-8000-000000000001",
    capturedAt: "2026-09-13T20:30:00.000Z",
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

function provider(
  expectedPrompt: Readonly<{
    queryId: string;
    queryVersion: string;
    queryText: string;
  }>,
  events: string[],
): GroundedAIProvider {
  return Object.freeze({
    capabilities: Object.freeze({
      provider: "gemini",
      surface: "api",
      grounding: "google_search",
      liveExecution: true,
      maxQueries: 1,
      maxCitations: 50,
    }),
    async query(input: unknown) {
      events.push("provider:query");
      assert.deepEqual(input, {
        observationId,
        queryId: expectedPrompt.queryId,
        queryVersion: expectedPrompt.queryVersion,
        queryText: expectedPrompt.queryText,
      });
      const observation: RawObservation = Object.freeze({
        observationId,
        queryId: expectedPrompt.queryId,
        queryVersion: expectedPrompt.queryVersion,
        queryText: expectedPrompt.queryText,
        provider: "gemini",
        surface: "api",
        captureVersion: "gemini-generate-content-v1",
        captureMode: "injected_transport",
        requestedModel: "gemini-bounded-test",
        modelVersion: "gemini-bounded-test",
        providerResponseId: "bounded-response",
        observedAt: "2026-09-13T20:30:01.000Z",
        rawResponse: '{"candidates":[],"usageMetadata":{"promptTokenCount":1}}',
        responseDigest:
          "sha256:e16c0e3fd79f4032bfc55fddcd2048e1f4907089e6f4cde143514f01c95bd9c5",
        rawResponseState: "complete",
        outcome: "answered",
        failureCode: null,
        answerText: "Fixture answer",
        finishReason: "STOP",
        groundingMetadata: null,
        citations: Object.freeze([]),
      });
      return { ok: true as const, observation };
    },
  });
}

test("one fixture carries durable provenance through exact claim execution and settlement", async () => {
  const events: string[] = [];
  let persistedPrompts: readonly Record<string, unknown>[] = [];

  const actorRpc = async (name: "reserve_scan_from_cohort", args: unknown) => {
    events.push(`actor:${name}`);
    const reservationArgs = args as Record<string, unknown>;
    return {
      data: {
        scanId,
        promptCohortId: reservationArgs.p_prompt_cohort_id,
        reservationId,
        reservedMicrounits: "42000",
        currency: "USD",
        provider: "gemini",
        modelId: "gemini-bounded-test",
        priceVersion: "price-v1",
        maxAttempts: 2,
        maxOutputTokens: 4096,
        requestFingerprint: "c".repeat(64),
        replayed: false,
      },
      error: null,
    };
  };

  const serviceRpc: SupabaseBoundedScanServiceRpc = async (name, args) => {
    events.push(`service:${name}`);
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
      persistedPrompts = promptArgs.p_prompts as readonly Record<
        string,
        unknown
      >[];
      return {
        data: {
          cohortId,
          profileSnapshotId,
          requestFingerprint: "b".repeat(64),
          queryCount: persistedPrompts.length,
          replayed: false,
        },
        error: null,
      };
    }
    if (name === "claim_scan_work_for_scan") {
      const prompt = persistedPrompts[0];
      assert.ok(prompt);
      return {
        data: {
          workspaceId,
          projectId,
          scanId,
          reservationId,
          attemptId,
          attemptNumber: 1,
          workerId,
          leaseToken,
          leaseExpiresAt: "2026-09-13T20:31:00.000Z",
          provider: "gemini",
          modelId: "gemini-bounded-test",
          priceVersion: "price-v1",
          currency: "USD",
          reservedMicrounits: "42000",
          maxAttempts: 2,
          maxOutputTokens: 4096,
          queries: [
            {
              queryOrdinal: 0,
              queryId: prompt.queryId,
              queryVersion: prompt.templateVersion,
              queryText: prompt.text,
              observationId,
            },
          ],
        },
        error: null,
      };
    }
    if (name === "renew_scan_work_lease")
      return {
        data: {
          workspaceId,
          scanId,
          attemptId,
          workerId,
          leaseToken,
          leaseExpiresAt: "2026-09-13T20:31:30.000Z",
        },
        error: null,
      };
    if (name === "persist_grounded_observation")
      return {
        data: {
          observationId,
          state: "answered",
          citationCount: 0,
          replayed: false,
        },
        error: null,
      };
    if (name === "complete_scan_work")
      return {
        data: {
          workspaceId,
          scanId,
          attemptId,
          state: "completed",
          reservationStatus: "settled",
          settledMicrounits: "1",
          costBasis: "gross_list_price",
          replayed: false,
        },
        error: null,
      };
    throw new Error(`unexpected service RPC ${name}`);
  };

  const result = await executeSupabaseBoundedScan(
    request(),
    actorRpc,
    serviceRpc,
    (config) => {
      assert.deepEqual(config, {
        provider: "gemini",
        modelId: "gemini-bounded-test",
        maxOutputTokens: 4096,
      });
      const prompt = persistedPrompts[0];
      assert.ok(prompt);
      assert.equal(typeof prompt.queryId, "string");
      assert.equal(typeof prompt.templateVersion, "string");
      assert.equal(typeof prompt.text, "string");
      return provider(
        {
          queryId: prompt.queryId as string,
          queryVersion: prompt.templateVersion as string,
          queryText: prompt.text as string,
        },
        events,
      );
    },
  );

  assert.equal(result.state, "execution_attempted");
  if (result.state !== "execution_attempted")
    throw new Error("expected exact claim execution");
  assert.equal(
    result.preparation.profile.snapshot.snapshotId,
    profileSnapshotId,
  );
  assert.equal(result.preparation.cohort.cohortId, cohortId);
  assert.equal(result.preparation.reservation.scanId, scanId);
  assert.equal(result.preparation.reservation.reservationId, reservationId);
  assert.equal(result.preparation.claim.attemptId, attemptId);
  assert.equal(result.preparation.claim.leaseToken, leaseToken);
  assert.equal(result.execution.ok, true);
  if (!result.execution.ok) throw new Error("expected completed execution");
  assert.equal(result.execution.state, "completed");
  assert.equal(result.execution.scanId, result.preparation.claim.scanId);
  assert.equal(result.execution.attemptId, result.preparation.claim.attemptId);
  assert.deepEqual(result.execution.observationIds, [observationId]);
  assert.deepEqual(events, [
    "service:persist_company_profile_snapshot",
    "service:persist_prompt_cohort",
    "actor:reserve_scan_from_cohort",
    "service:claim_scan_work_for_scan",
    "service:renew_scan_work_lease",
    "provider:query",
    "service:persist_grounded_observation",
    "service:complete_scan_work",
  ]);
  assert.equal(events.includes("service:claim_scan_work"), false);
});

test("queued exact claim stops before provider and execution RPCs", async () => {
  const serviceCalls: string[] = [];
  let providerCalls = 0;

  const result = await executeSupabaseBoundedScan(
    request(),
    async (_name, args) => {
      const reservationArgs = args as Record<string, unknown>;
      return {
        data: {
          scanId,
          promptCohortId: reservationArgs.p_prompt_cohort_id,
          reservationId,
          reservedMicrounits: "42000",
          currency: "USD",
          provider: "gemini",
          modelId: "gemini-bounded-test",
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
      serviceCalls.push(name);
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
      if (name === "claim_scan_work_for_scan")
        return { data: null, error: null };
      throw new Error(`execution RPC must not run: ${name}`);
    },
    () => {
      providerCalls += 1;
      throw new Error("provider must not be configured for queued work");
    },
  );

  assert.equal(result.state, "not_executed");
  assert.equal(result.preparation.ok, true);
  if (!result.preparation.ok) throw new Error("expected queued preparation");
  assert.equal(result.preparation.state, "queued");
  assert.equal(result.execution, null);
  assert.equal(providerCalls, 0);
  assert.deepEqual(serviceCalls, [
    "persist_company_profile_snapshot",
    "persist_prompt_cohort",
    "claim_scan_work_for_scan",
  ]);
});

test("upstream persistence failure cannot reach reservation or provider execution", async () => {
  let actorCalls = 0;
  let providerCalls = 0;
  const serviceCalls: string[] = [];

  const result = await executeSupabaseBoundedScan(
    request(),
    async () => {
      actorCalls += 1;
      throw new Error("reservation must not run");
    },
    async (name) => {
      serviceCalls.push(name);
      throw new Error("profile persistence unavailable");
    },
    () => {
      providerCalls += 1;
      throw new Error("provider must not run");
    },
  );

  assert.equal(result.state, "not_executed");
  assert.equal(result.preparation.ok, false);
  if (result.preparation.ok) throw new Error("expected profile failure");
  assert.equal(result.preparation.stage, "profile");
  assert.deepEqual(result.preparation.failure, {
    ok: false,
    code: "database_error",
  });
  assert.equal(result.execution, null);
  assert.equal(actorCalls, 0);
  assert.equal(providerCalls, 0);
  assert.deepEqual(serviceCalls, ["persist_company_profile_snapshot"]);
});
