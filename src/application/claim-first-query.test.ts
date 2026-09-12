import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  GroundedAIProvider,
  GroundedQueryResponse,
} from "./grounded-ai-provider.ts";
import type { GroundedObservationPersistenceGateway } from "./grounded-observation-persistence.ts";
import {
  claimAndExecuteFirstQuery,
  type ClaimedLiveProviderFactory,
} from "./claim-first-query.ts";
import type { ScanWorkClaim, ScanWorkerGateway } from "./scan-worker.ts";
import type { RawObservation } from "../domain/raw-observation.ts";

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
  leaseExpiresAt: "2026-09-13T00:45:00.000Z",
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

function observation(): RawObservation {
  return Object.freeze({
    observationId: claim.queries[0]!.observationId,
    queryId: claim.queries[0]!.queryId,
    queryVersion: claim.queries[0]!.queryVersion,
    queryText: claim.queries[0]!.queryText,
    provider: "gemini",
    surface: "api",
    captureVersion: "gemini-generate-content-v1",
    captureMode: "injected_transport",
    requestedModel: claim.modelId,
    modelVersion: claim.modelId,
    providerResponseId: "fixture-response",
    observedAt: "2026-09-12T19:30:00.000Z",
    rawResponse: '{"candidates":[]}',
    responseDigest:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    rawResponseState: "complete",
    outcome: "answered",
    failureCode: null,
    answerText: "Fixture answer",
    finishReason: "STOP",
    groundingMetadata: null,
    citations: Object.freeze([]),
  });
}

function gateway(result: ScanWorkClaim | null): ScanWorkerGateway {
  return Object.freeze({
    async claim(request) {
      assert.deepEqual(request, { workerId, leaseSeconds: 30 });
      return { ok: true, claim: result };
    },
    async renew() {
      throw new Error("renew is out of scope");
    },
    async retry() {
      throw new Error("retry is out of scope");
    },
  });
}

function liveProvider(): GroundedAIProvider {
  return Object.freeze({
    capabilities: Object.freeze({
      provider: "gemini",
      surface: "api",
      grounding: "google_search",
      liveExecution: true,
      maxQueries: 1,
      maxCitations: 50,
    }),
    async query(input: unknown): Promise<GroundedQueryResponse> {
      assert.deepEqual(input, {
        observationId: claim.queries[0]!.observationId,
        queryId: claim.queries[0]!.queryId,
        queryVersion: claim.queries[0]!.queryVersion,
        queryText: claim.queries[0]!.queryText,
      });
      return { ok: true, observation: observation() };
    },
  });
}

test("claims one attempt, derives provider config from the claim and persists only query zero", async () => {
  let factoryCalls = 0;
  let persistenceCalls = 0;
  const factory: ClaimedLiveProviderFactory = (config) => {
    factoryCalls += 1;
    assert.deepEqual(config, {
      provider: "gemini",
      modelId: claim.modelId,
      maxOutputTokens: claim.maxOutputTokens,
    });
    return liveProvider();
  };
  const persistence: GroundedObservationPersistenceGateway = async (
    request,
  ) => {
    persistenceCalls += 1;
    assert.equal(request.queryOrdinal, 0);
    assert.equal(
      request.observation.observationId,
      claim.queries[0]!.observationId,
    );
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

  const result = await claimAndExecuteFirstQuery(
    { workerId, leaseSeconds: 30 },
    gateway(claim),
    factory,
    persistence,
  );

  assert.deepEqual(result, {
    ok: true,
    state: "persisted",
    workspaceId: claim.workspaceId,
    scanId: claim.scanId,
    attemptId: claim.attemptId,
    observationId: claim.queries[0]!.observationId,
  });
  assert.equal(factoryCalls, 1);
  assert.equal(persistenceCalls, 1);
});

test("an idle claim returns without constructing a provider or touching persistence", async () => {
  let factoryCalls = 0;
  let persistenceCalls = 0;
  const factory: ClaimedLiveProviderFactory = () => {
    factoryCalls += 1;
    return liveProvider();
  };
  const persistence: GroundedObservationPersistenceGateway = async () => {
    persistenceCalls += 1;
    throw new Error("persistence must not run");
  };

  const result = await claimAndExecuteFirstQuery(
    { workerId, leaseSeconds: 30 },
    gateway(null),
    factory,
    persistence,
  );

  assert.deepEqual(result, { ok: true, state: "idle" });
  assert.equal(factoryCalls, 0);
  assert.equal(persistenceCalls, 0);
});

test("provider setup failure stops before query execution or persistence", async () => {
  let persistenceCalls = 0;
  const persistence: GroundedObservationPersistenceGateway = async () => {
    persistenceCalls += 1;
    throw new Error("persistence must not run");
  };

  const result = await claimAndExecuteFirstQuery(
    { workerId, leaseSeconds: 30 },
    gateway(claim),
    () => null,
    persistence,
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "provider_setup",
    code: "provider_setup_failed",
  });
  assert.equal(persistenceCalls, 0);
});
