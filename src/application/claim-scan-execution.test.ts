import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  GroundedAIProvider,
  GroundedQueryResponse,
} from "./grounded-ai-provider.ts";
import type { GroundedObservationPersistenceGateway } from "./grounded-observation-persistence.ts";
import {
  claimAndExecuteScanQueries,
  type ClaimedLiveProviderFactory,
} from "./claim-scan-execution.ts";
import type { ScanWorkClaim, ScanWorkerGateway } from "./scan-worker.ts";
import type { RawObservation } from "../domain/raw-observation.ts";

const workerId = "11111111-1111-4111-8111-111111111111";
const leaseSeconds = 30;
const claim: ScanWorkClaim = Object.freeze({
  workspaceId: "22222222-2222-4222-8222-222222222222",
  scanId: "33333333-3333-4333-8333-333333333333",
  projectId: "44444444-4444-4444-8444-444444444444",
  reservationId: "55555555-5555-4555-8555-555555555555",
  attemptId: "66666666-6666-4666-8666-666666666666",
  attemptNumber: 1,
  workerId,
  leaseToken: "77777777-7777-4777-8777-777777777777",
  leaseExpiresAt: "2026-09-13T03:00:30.000Z",
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

function observation(queryOrdinal: number): RawObservation {
  const query = claim.queries[queryOrdinal]!;
  return Object.freeze({
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
    providerResponseId: `fixture-response-${queryOrdinal}`,
    observedAt: "2026-09-13T03:00:00.000Z",
    rawResponse: '{"candidates":[]}',
    responseDigest:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    rawResponseState: "complete",
    outcome: "answered",
    failureCode: null,
    answerText: `Fixture answer ${queryOrdinal}`,
    finishReason: "STOP",
    groundingMetadata: null,
    citations: Object.freeze([]),
  });
}

function successfulGateway(onRenew?: (call: number) => void): ScanWorkerGateway {
  let renewCalls = 0;
  return Object.freeze({
    async claim(request) {
      assert.deepEqual(request, { workerId, leaseSeconds });
      return { ok: true, claim };
    },
    async renew(request) {
      renewCalls += 1;
      onRenew?.(renewCalls);
      assert.deepEqual(request, {
        workspaceId: claim.workspaceId,
        scanId: claim.scanId,
        attemptId: claim.attemptId,
        workerId: claim.workerId,
        leaseToken: claim.leaseToken,
        leaseSeconds,
      });
      return {
        ok: true,
        lease: {
          workspaceId: claim.workspaceId,
          scanId: claim.scanId,
          attemptId: claim.attemptId,
          workerId: claim.workerId,
          leaseToken: claim.leaseToken,
          leaseExpiresAt: `2026-09-13T03:00:${30 + renewCalls}.000Z`,
        },
      };
    },
    async retry() {
      throw new Error("retry is out of scope");
    },
  });
}

function liveProvider(onQuery?: (queryOrdinal: number) => void): GroundedAIProvider {
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
      const queryOrdinal = claim.queries.findIndex(
        (query) =>
          typeof input === "object" &&
          input !== null &&
          "observationId" in input &&
          input.observationId === query.observationId,
      );
      assert.notEqual(queryOrdinal, -1);
      const query = claim.queries[queryOrdinal]!;
      assert.deepEqual(input, {
        observationId: query.observationId,
        queryId: query.queryId,
        queryVersion: query.queryVersion,
        queryText: query.queryText,
      });
      onQuery?.(queryOrdinal);
      return { ok: true, observation: observation(queryOrdinal) };
    },
  });
}

function persistenceGateway(
  onPersist?: (queryOrdinal: number) => void,
): GroundedObservationPersistenceGateway {
  return async (request) => {
    const query = claim.queries[request.queryOrdinal]!;
    assert.equal(request.observation.observationId, query.observationId);
    onPersist?.(request.queryOrdinal);
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

test("renews before and persists every claimed query in ordinal order", async () => {
  const events: string[] = [];
  let factoryCalls = 0;
  const factory: ClaimedLiveProviderFactory = (config) => {
    factoryCalls += 1;
    assert.deepEqual(config, {
      provider: "gemini",
      modelId: claim.modelId,
      maxOutputTokens: claim.maxOutputTokens,
    });
    return liveProvider((queryOrdinal) => events.push(`query:${queryOrdinal}`));
  };

  const result = await claimAndExecuteScanQueries(
    { workerId, leaseSeconds },
    successfulGateway((call) => events.push(`renew:${call - 1}`)),
    factory,
    persistenceGateway((queryOrdinal) => events.push(`persist:${queryOrdinal}`)),
  );

  assert.deepEqual(result, {
    ok: true,
    state: "persisted",
    workspaceId: claim.workspaceId,
    scanId: claim.scanId,
    attemptId: claim.attemptId,
    observationIds: claim.queries.map((query) => query.observationId),
  });
  assert.deepEqual(events, [
    "renew:0",
    "query:0",
    "persist:0",
    "renew:1",
    "query:1",
    "persist:1",
  ]);
  assert.equal(factoryCalls, 1);
});

test("a renewal failure stops before the next paid query", async () => {
  let renewCalls = 0;
  let queryCalls = 0;
  let persistenceCalls = 0;
  const workerGateway: ScanWorkerGateway = Object.freeze({
    async claim() {
      return { ok: true, claim };
    },
    async renew(request) {
      renewCalls += 1;
      if (renewCalls === 2) return { ok: false, code: "lease_expired" };
      return {
        ok: true,
        lease: {
          workspaceId: request.workspaceId,
          scanId: request.scanId,
          attemptId: request.attemptId,
          workerId: request.workerId,
          leaseToken: request.leaseToken,
          leaseExpiresAt: "2026-09-13T03:01:00.000Z",
        },
      };
    },
    async retry() {
      throw new Error("retry is out of scope");
    },
  });

  const result = await claimAndExecuteScanQueries(
    { workerId, leaseSeconds },
    workerGateway,
    () => liveProvider(() => {
      queryCalls += 1;
    }),
    persistenceGateway(() => {
      persistenceCalls += 1;
    }),
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "renew",
    queryOrdinal: 1,
    code: "lease_expired",
  });
  assert.equal(renewCalls, 2);
  assert.equal(queryCalls, 1);
  assert.equal(persistenceCalls, 1);
});

test("rejects a live lease shorter than the provider timeout buffer before claiming work", async () => {
  let claimCalls = 0;
  const workerGateway: ScanWorkerGateway = Object.freeze({
    async claim() {
      claimCalls += 1;
      throw new Error("claim must not run");
    },
    async renew() {
      throw new Error("renew must not run");
    },
    async retry() {
      throw new Error("retry must not run");
    },
  });

  const result = await claimAndExecuteScanQueries(
    { workerId, leaseSeconds: 20 },
    workerGateway,
    () => liveProvider(),
    persistenceGateway(),
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "claim",
    code: "invalid_live_lease_seconds",
  });
  assert.equal(claimCalls, 0);
});

test("idle claims and provider setup failures do not renew or execute", async () => {
  let renewCalls = 0;
  const idleGateway: ScanWorkerGateway = Object.freeze({
    async claim() {
      return { ok: true, claim: null };
    },
    async renew() {
      renewCalls += 1;
      throw new Error("renew must not run");
    },
    async retry() {
      throw new Error("retry must not run");
    },
  });

  const idle = await claimAndExecuteScanQueries(
    { workerId, leaseSeconds },
    idleGateway,
    () => liveProvider(),
    persistenceGateway(),
  );
  assert.deepEqual(idle, { ok: true, state: "idle" });
  assert.equal(renewCalls, 0);

  const setupFailure = await claimAndExecuteScanQueries(
    { workerId, leaseSeconds },
    successfulGateway(() => {
      renewCalls += 1;
    }),
    () => null,
    persistenceGateway(),
  );
  assert.deepEqual(setupFailure, {
    ok: false,
    stage: "provider_setup",
    code: "provider_setup_failed",
  });
  assert.equal(renewCalls, 0);
});
