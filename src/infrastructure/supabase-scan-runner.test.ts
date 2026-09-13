import assert from "node:assert/strict";
import test from "node:test";

import type { GroundedAIProvider } from "../application/grounded-ai-provider.ts";
import type { RawObservation } from "../domain/raw-observation.ts";
import {
  executeSupabaseScanWorkerOnce,
  type SupabaseScanWorkerRpc,
} from "./supabase-scan-runner.ts";

const workerId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const scanId = "33333333-3333-4333-8333-333333333333";
const projectId = "44444444-4444-4444-8444-444444444444";
const reservationId = "55555555-5555-4555-8555-555555555555";
const attemptId = "66666666-6666-4666-8666-666666666666";
const leaseToken = "77777777-7777-4777-8777-777777777777";
const observationId = "88888888-8888-4888-8888-888888888888";

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
        queryId: "runner-query",
        queryVersion: "category@v1",
        queryText: "Which tools are available?",
      });
      const observation: RawObservation = Object.freeze({
        observationId,
        queryId: "runner-query",
        queryVersion: "category@v1",
        queryText: "Which tools are available?",
        provider: "gemini",
        surface: "api",
        captureVersion: "gemini-generate-content-v1",
        captureMode: "injected_transport",
        requestedModel: "gemini-runner-test",
        modelVersion: "gemini-runner-test",
        providerResponseId: "runner-response",
        observedAt: "2026-09-13T04:00:00.000Z",
        rawResponse: '{"candidates":[],"usageMetadata":{"promptTokenCount":1}}',
        responseDigest:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        rawResponseState: "complete",
        outcome: "answered",
        failureCode: null,
        answerText: "Runner answer",
        finishReason: "STOP",
        groundingMetadata: null,
        citations: Object.freeze([]),
      });
      return { ok: true as const, observation };
    },
  });
}

test("server RPC runner persists claimed evidence and always finalizes metering", async () => {
  const calls: Array<Readonly<{ name: string; args: Record<string, unknown> }>> = [];
  const rpc: SupabaseScanWorkerRpc = async (name, args) => {
    calls.push({ name, args: { ...args } });
    if (name === "claim_scan_work")
      return {
        data: {
          workspaceId,
          scanId,
          projectId,
          reservationId,
          attemptId,
          attemptNumber: 1,
          workerId,
          leaseToken,
          leaseExpiresAt: "2026-09-13T04:01:00.000Z",
          provider: "gemini",
          modelId: "gemini-runner-test",
          priceVersion: "runner-price-v1",
          currency: "USD",
          reservedMicrounits: "100",
          maxAttempts: 2,
          maxOutputTokens: 2048,
          queries: [
            {
              queryOrdinal: 0,
              queryId: "runner-query",
              queryVersion: "category@v1",
              queryText: "Which tools are available?",
              observationId,
            },
          ],
        },
        error: null,
      };
    if (name === "renew_scan_work_lease")
      return {
        data: {
          workspaceId,
          scanId,
          attemptId,
          workerId,
          leaseToken,
          leaseExpiresAt: "2026-09-13T04:01:30.000Z",
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

  const result = await executeSupabaseScanWorkerOnce(
    { workerId, leaseSeconds: 60 },
    rpc,
    (config) => {
      assert.deepEqual(config, {
        provider: "gemini",
        modelId: "gemini-runner-test",
        maxOutputTokens: 2048,
      });
      return provider();
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "completed");
  assert.deepEqual(
    calls.map((call) => call.name),
    [
      "claim_scan_work",
      "renew_scan_work_lease",
      "persist_grounded_observation",
      "complete_scan_work",
    ],
  );
  const completion = calls.at(-1)!;
  assert.deepEqual(completion.args, {
    p_workspace_id: workspaceId,
    p_scan_id: scanId,
    p_attempt_id: attemptId,
    p_worker_id: workerId,
    p_lease_token: leaseToken,
  });
  assert.equal(Object.hasOwn(completion.args, "settled_microunits"), false);
});
