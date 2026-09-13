import assert from "node:assert/strict";
import { test } from "node:test";

import {
  claimAndExecuteScanQueries,
  type ClaimedLiveProviderFactory,
} from "./claim-scan-execution.ts";
import type { GroundedObservationPersistenceGateway } from "./grounded-observation-persistence.ts";
import type { ScanCompletionGateway } from "./scan-completion.ts";
import type { ScanWorkClaim, ScanWorkerGateway } from "./scan-worker.ts";
import type { GroundedAIProvider } from "./grounded-ai-provider.ts";

const workerId = "11111111-1111-4111-8111-111111111111";
const claim: ScanWorkClaim = Object.freeze({
  workspaceId: "22222222-2222-4222-8222-222222222222",
  scanId: "33333333-3333-4333-8333-333333333333",
  projectId: "44444444-4444-4444-8444-444444444444",
  reservationId: "55555555-5555-4555-8555-555555555555",
  attemptId: "66666666-6666-4666-8666-666666666666",
  attemptNumber: 1,
  workerId,
  leaseToken: "77777777-7777-4777-8777-777777777777",
  leaseExpiresAt: "2026-09-13T03:20:30.000Z",
  provider: "gemini",
  modelId: "gemini-3-flash-preview",
  priceVersion: "gemini-3-flash-preview-2026-09",
  currency: "USD",
  reservedMicrounits: "1000",
  maxAttempts: 2,
  maxOutputTokens: 2048,
  queries: Object.freeze([
    Object.freeze({
      queryOrdinal: 0,
      queryId: "query-0",
      queryVersion: "category@v1",
      queryText: "Which tools serve B2B agencies?",
      observationId: "88888888-8888-4888-8888-888888888888",
    }),
    Object.freeze({
      queryOrdinal: 1,
      queryId: "query-1",
      queryVersion: "buyer@v1",
      queryText: "What should a B2B agency buy?",
      observationId: "99999999-9999-4999-8999-999999999999",
    }),
  ]),
});

function workerGateway(events: string[]): ScanWorkerGateway {
  return Object.freeze({
    async claim() {
      return { ok: true, claim };
    },
    async renew() {
      const ordinal = events.filter((event) =>
        event.startsWith("renew:"),
      ).length;
      events.push(`renew:${ordinal}`);
      return {
        ok: true,
        lease: {
          workspaceId: claim.workspaceId,
          scanId: claim.scanId,
          attemptId: claim.attemptId,
          workerId: claim.workerId,
          leaseToken: claim.leaseToken,
          leaseExpiresAt: "2026-09-13T03:21:00.000Z",
        },
      };
    },
    async retry() {
      throw new Error("retry must not run on successful evidence");
    },
  });
}

function providerFactory(events: string[]): ClaimedLiveProviderFactory {
  return () => {
    const provider: GroundedAIProvider = Object.freeze({
      capabilities: Object.freeze({
        provider: "gemini",
        surface: "api",
        grounding: "google_search",
        liveExecution: true,
        maxQueries: 1,
        maxCitations: 50,
      }),
      async query(input: unknown) {
        const query = claim.queries.find(
          (candidate) =>
            typeof input === "object" &&
            input !== null &&
            "observationId" in input &&
            input.observationId === candidate.observationId,
        );
        assert.ok(query);
        events.push(`query:${query.queryOrdinal}`);
        return {
          ok: true,
          observation: {
            observationId: query.observationId,
            queryId: query.queryId,
            queryVersion: query.queryVersion,
            queryText: query.queryText,
            provider: "gemini",
            surface: "api",
            captureVersion: "gemini-generate-content-v1",
            captureMode: "injected_transport",
            requestedModel: claim.modelId,
            modelVersion: claim.modelId,
            providerResponseId: `response-${query.queryOrdinal}`,
            observedAt: "2026-09-13T03:20:00.000Z",
            rawResponse: '{"candidates":[]}',
            responseDigest:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            rawResponseState: "complete",
            outcome: "answered",
            failureCode: null,
            answerText: `Answer ${query.queryOrdinal}`,
            finishReason: "STOP",
            groundingMetadata: null,
            citations: Object.freeze([]),
          },
        };
      },
    });
    return provider;
  };
}

function persistenceGateway(
  events: string[],
): GroundedObservationPersistenceGateway {
  return async (request) => {
    events.push(`persist:${request.queryOrdinal}`);
    return {
      ok: true,
      snapshot: {
        observationId: request.observation.observationId,
        state: "answered",
        citationCount: 0,
        replayed: false,
      },
    };
  };
}

test("completes only after every claimed query has durable evidence", async () => {
  const events: string[] = [];
  const completionGateway: ScanCompletionGateway = async (request) => {
    events.push("complete");
    assert.deepEqual(request, {
      workspaceId: claim.workspaceId,
      scanId: claim.scanId,
      attemptId: claim.attemptId,
      workerId: claim.workerId,
      leaseToken: claim.leaseToken,
    });
    return {
      ok: true,
      completion: {
        workspaceId: claim.workspaceId,
        scanId: claim.scanId,
        attemptId: claim.attemptId,
        state: "completed",
        reservationStatus: "settled",
        settledMicrounits: "26",
        costBasis: "gross_list_price",
        replayed: false,
      },
    };
  };

  const result = await claimAndExecuteScanQueries(
    { workerId, leaseSeconds: 30 },
    workerGateway(events),
    providerFactory(events),
    persistenceGateway(events),
    completionGateway,
  );

  assert.deepEqual(events, [
    "renew:0",
    "query:0",
    "persist:0",
    "renew:1",
    "query:1",
    "persist:1",
    "complete",
  ]);
  assert.equal(result.ok, true);
  if (!result.ok || result.state !== "completed")
    throw new Error("expected completed scan");
  assert.deepEqual(
    result.observationIds,
    claim.queries.map((query) => query.observationId),
  );
  assert.equal(result.completion.settledMicrounits, "26");
});

test("completion database failures are surfaced without inventing settlement", async () => {
  const events: string[] = [];
  const completionGateway: ScanCompletionGateway = async () => {
    events.push("complete");
    return { ok: false, code: "metering_unavailable" };
  };

  const result = await claimAndExecuteScanQueries(
    { workerId, leaseSeconds: 30 },
    workerGateway(events),
    providerFactory(events),
    persistenceGateway(events),
    completionGateway,
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "completion",
    code: "metering_unavailable",
  });
  assert.equal(events.at(-1), "complete");
});
