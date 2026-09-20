import assert from "node:assert/strict";
import test from "node:test";

import type { GroundedAIProvider } from "../application/grounded-ai-provider.ts";
import type { ScanWorkClaim } from "../application/scan-worker.ts";
import type { RawObservation } from "../domain/raw-observation.ts";
import {
  executeSupabasePreclaimedScan,
  type SupabasePreclaimedScanRpc,
} from "./supabase-preclaimed-scan-runner.ts";

const workerId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const scanId = "33333333-3333-4333-8333-333333333333";
const projectId = "44444444-4444-4444-8444-444444444444";
const reservationId = "55555555-5555-4555-8555-555555555555";
const attemptId = "66666666-6666-4666-8666-666666666666";
const leaseToken = "77777777-7777-4777-8777-777777777777";
const observationId = "88888888-8888-4888-8888-888888888888";

const claim: ScanWorkClaim = Object.freeze({
  workspaceId,
  scanId,
  projectId,
  reservationId,
  attemptId,
  attemptNumber: 1,
  workerId,
  leaseToken,
  leaseExpiresAt: "2026-09-13T20:00:30.000Z",
  provider: "gemini",
  modelId: "gemini-preclaimed-test",
  priceVersion: "preclaimed-price-v1",
  currency: "USD",
  reservedMicrounits: "100",
  maxAttempts: 2,
  maxOutputTokens: 2048,
  queries: Object.freeze([
    Object.freeze({
      queryOrdinal: 0,
      queryId: "preclaimed-query",
      queryVersion: "category@v1",
      queryText: "Which AI visibility tools are available?",
      observationId,
    }),
  ]),
});

function provider(): GroundedAIProvider {
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
      assert.deepEqual(input, {
        observationId,
        queryId: "preclaimed-query",
        queryVersion: "category@v1",
        queryText: "Which AI visibility tools are available?",
      });
      const observation: RawObservation = Object.freeze({
        observationId,
        queryId: "preclaimed-query",
        queryVersion: "category@v1",
        queryText: "Which AI visibility tools are available?",
        provider: "gemini",
        surface: "api",
        captureVersion: "gemini-generate-content-v1",
        captureMode: "injected_transport",
        requestedModel: claim.modelId,
        modelVersion: claim.modelId,
        providerResponseId: "preclaimed-response",
        observedAt: "2026-09-13T20:00:00.000Z",
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

test("exact targeted claim executes without a global queue reclaim", async () => {
  const calls: Array<
    Readonly<{ name: string; args: Readonly<Record<string, unknown>> }>
  > = [];
  const rpc: SupabasePreclaimedScanRpc = async (name, args) => {
    calls.push({ name, args });
    if (name === "renew_scan_work_lease")
      return {
        data: {
          workspaceId,
          scanId,
          attemptId,
          workerId,
          leaseToken,
          leaseExpiresAt: "2026-09-13T20:01:00.000Z",
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
    throw new Error(`unexpected RPC ${name}`);
  };

  const result = await executeSupabasePreclaimedScan(
    { claim, leaseSeconds: 60 },
    rpc,
    (config) => {
      assert.deepEqual(config, {
        provider: "gemini",
        modelId: claim.modelId,
        maxOutputTokens: claim.maxOutputTokens,
      });
      return provider();
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected completed exact claim");
  assert.equal(result.state, "completed");
  assert.equal(result.workspaceId, claim.workspaceId);
  assert.equal(result.scanId, claim.scanId);
  assert.equal(result.attemptId, claim.attemptId);
  assert.deepEqual(result.observationIds, [observationId]);
  assert.deepEqual(
    calls.map(({ name }) => name),
    [
      "renew_scan_work_lease",
      "persist_grounded_observation",
      "complete_scan_work",
    ],
  );
  assert.deepEqual(calls[0]!.args, {
    p_workspace_id: workspaceId,
    p_scan_id: scanId,
    p_attempt_id: attemptId,
    p_worker_id: workerId,
    p_lease_token: leaseToken,
    p_lease_seconds: 60,
  });
  assert.deepEqual(calls[2]!.args, {
    p_workspace_id: workspaceId,
    p_scan_id: scanId,
    p_attempt_id: attemptId,
    p_worker_id: workerId,
    p_lease_token: leaseToken,
  });
});

test("invalid live lease fails before any RPC or provider execution", async () => {
  let providerCalls = 0;
  let rpcCalls = 0;

  const result = await executeSupabasePreclaimedScan(
    { claim, leaseSeconds: 20 },
    async () => {
      rpcCalls += 1;
      throw new Error("RPC must not run");
    },
    () => {
      providerCalls += 1;
      return provider();
    },
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "claim",
    code: "invalid_live_lease_seconds",
  });
  assert.equal(rpcCalls, 0);
  assert.equal(providerCalls, 0);
});
