import assert from "node:assert/strict";
import { test } from "node:test";
import type { GroundedAIProvider } from "./grounded-ai-provider.ts";
import type { GroundedObservationPersistenceGateway } from "./grounded-observation-persistence.ts";
import { executeClaimedQuery } from "./execute-claimed-query.ts";
import type { ScanWorkClaim } from "./scan-worker.ts";
import type { RawObservation } from "../domain/raw-observation.ts";

const claim: ScanWorkClaim = Object.freeze({
  workspaceId: "11111111-1111-4111-8111-111111111111",
  scanId: "22222222-2222-4222-8222-222222222222",
  projectId: "33333333-3333-4333-8333-333333333333",
  reservationId: "44444444-4444-4444-8444-444444444444",
  attemptId: "55555555-5555-4555-8555-555555555555",
  attemptNumber: 1,
  workerId: "66666666-6666-4666-8666-666666666666",
  leaseToken: "77777777-7777-4777-8777-777777777777",
  leaseExpiresAt: "2026-09-13T00:30:00.000Z",
  provider: "gemini",
  modelId: "gemini-3-flash-preview",
  priceVersion: "gemini-3-flash-preview-2026-09",
  currency: "USD",
  reservedMicrounits: "1000",
  maxAttempts: 2,
  maxOutputTokens: 4096,
  queries: Object.freeze([
    Object.freeze({
      queryOrdinal: 0,
      queryId: "query-1",
      queryVersion: "category@v1",
      queryText: "Which tools serve B2B agencies?",
      observationId: "88888888-8888-4888-8888-888888888888",
    }),
  ]),
});

function observation(overrides: Partial<RawObservation> = {}): RawObservation {
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
    modelVersion: "gemini-3-flash-preview",
    providerResponseId: "response-1",
    observedAt: "2026-09-12T19:00:00.000Z",
    rawResponse: '{"candidates":[]}',
    responseDigest:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    rawResponseState: "complete",
    outcome: "answered",
    failureCode: null,
    answerText: "Example answer",
    finishReason: "STOP",
    groundingMetadata: null,
    citations: Object.freeze([]),
    ...overrides,
  });
}

function liveProvider(value: RawObservation): GroundedAIProvider {
  return Object.freeze({
    capabilities: Object.freeze({
      provider: "gemini",
      surface: "api",
      grounding: "google_search",
      liveExecution: true,
      maxQueries: 1,
      maxCitations: 50,
    }),
    async query(input) {
      assert.deepEqual(input, {
        observationId: claim.queries[0]!.observationId,
        queryId: claim.queries[0]!.queryId,
        queryVersion: claim.queries[0]!.queryVersion,
        queryText: claim.queries[0]!.queryText,
      });
      return { ok: true, observation: value };
    },
  });
}

test("executes one claimed query with the database-issued observation UUID and persists exact evidence", async () => {
  let persisted = 0;
  const gateway: GroundedObservationPersistenceGateway = async (request) => {
    persisted += 1;
    assert.equal(request.workspaceId, claim.workspaceId);
    assert.equal(request.scanId, claim.scanId);
    assert.equal(request.attemptId, claim.attemptId);
    assert.equal(request.workerId, claim.workerId);
    assert.equal(request.leaseToken, claim.leaseToken);
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

  const result = await executeClaimedQuery(
    claim,
    0,
    liveProvider(observation()),
    gateway,
  );

  assert.equal(result.ok, true);
  assert.equal(persisted, 1);
  if (result.ok)
    assert.equal(
      result.snapshot.observationId,
      claim.queries[0]!.observationId,
    );
});

test("refuses a non-live provider before any query or persistence call", async () => {
  let providerCalls = 0;
  let persistenceCalls = 0;
  const provider: GroundedAIProvider = Object.freeze({
    capabilities: Object.freeze({
      provider: "gemini",
      surface: "api",
      grounding: "google_search",
      liveExecution: false,
      maxQueries: 1,
      maxCitations: 50,
    }),
    async query() {
      providerCalls += 1;
      return { ok: true, observation: observation() };
    },
  });
  const gateway: GroundedObservationPersistenceGateway = async () => {
    persistenceCalls += 1;
    throw new Error("must not persist");
  };

  const result = await executeClaimedQuery(claim, 0, provider, gateway);
  assert.deepEqual(result, {
    ok: false,
    stage: "claim",
    code: "live_provider_required",
  });
  assert.equal(providerCalls, 0);
  assert.equal(persistenceCalls, 0);
});

test("fails closed when provider changes the canonical query identity", async () => {
  let persistenceCalls = 0;
  const gateway: GroundedObservationPersistenceGateway = async () => {
    persistenceCalls += 1;
    throw new Error("must not persist");
  };

  const result = await executeClaimedQuery(
    claim,
    0,
    liveProvider(
      observation({
        observationId: "99999999-9999-4999-8999-999999999999",
      }),
    ),
    gateway,
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "provider",
    code: "identity_mismatch",
  });
  assert.equal(persistenceCalls, 0);
});
