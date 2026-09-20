import assert from "node:assert/strict";
import { test } from "node:test";

import type { RawObservation } from "../domain/raw-observation.ts";
import {
  persistGroundedObservation,
  type GroundedObservationPersistenceGateway,
  type ValidatedGroundedObservationPersistenceRequest,
} from "./grounded-observation-persistence.ts";

const workspaceId = "e2000000-0000-4000-8000-000000000001";
const scanId = "e3000000-0000-4000-8000-000000000001";
const attemptId = "e4000000-0000-4000-8000-000000000001";
const workerId = "e5000000-0000-4000-8000-000000000001";
const leaseToken = "e6000000-0000-4000-8000-000000000001";
const observationId = "e7000000-0000-4000-8000-000000000001";
const observedAt = "2026-09-12T14:05:00.000Z";

function observation(
  overrides: Record<string, unknown> = {},
): RawObservation & Record<string, unknown> {
  return {
    observationId,
    queryId: "niche-prompts-v1:test",
    queryVersion: "category@v1",
    queryText: 'Which tools are available for "AI visibility"?',
    provider: "gemini",
    surface: "api",
    captureVersion: "gemini-generate-content-v1",
    captureMode: "injected_transport",
    requestedModel: "gemini-test-model",
    modelVersion: "gemini-test-model-001",
    providerResponseId: "response-1",
    observedAt,
    rawResponse: '{"fixture":true}',
    responseDigest: `sha256:${"a".repeat(64)}`,
    rawResponseState: "complete",
    outcome: "answered",
    failureCode: null,
    answerText: "Example answer",
    finishReason: "STOP",
    groundingMetadata: {
      groundingChunks: [
        { web: { uri: "https://example.com/a", title: "Example" } },
      ],
    },
    citations: [
      {
        citationId: `${observationId}:grounding:0`,
        observationId,
        citedUrl: "https://example.com/a",
        sourceTitle: "Example",
        capturedAt: observedAt,
        relationship: "source_list_only",
        verification: "not_checked",
        groundingChunkIndex: 0,
        urlStatus: "eligible",
        sourceDomain: "example.com",
        exclusionReason: null,
      },
    ],
    ...overrides,
  } as RawObservation & Record<string, unknown>;
}

function request(observationValue: unknown = observation()) {
  return {
    workspaceId,
    scanId,
    attemptId,
    workerId,
    leaseToken,
    queryOrdinal: 0,
    observation: observationValue,
  };
}

function gateway(
  inspect?: (value: ValidatedGroundedObservationPersistenceRequest) => void,
): GroundedObservationPersistenceGateway {
  return async (value) => {
    inspect?.(value);
    return {
      ok: true,
      snapshot: {
        observationId: value.observation.observationId,
        state:
          value.observation.outcome === "failed" &&
          value.observation.failureCode === "cancelled"
            ? "cancelled"
            : value.observation.outcome,
        citationCount: value.observation.citations.length,
        replayed: false,
      },
    };
  };
}

test("sanitizes and freezes exact provider evidence before persistence", async () => {
  const raw = observation({ unexpected: "drop-me" });
  let captured: ValidatedGroundedObservationPersistenceRequest | undefined;
  const result = await persistGroundedObservation(
    request(raw),
    gateway((value) => {
      captured = value;
    }),
  );

  assert.equal(result.ok, true);
  assert.ok(captured);
  assert.equal(captured.observation.observationId, observationId);
  assert.equal(Object.hasOwn(captured.observation, "unexpected"), false);
  assert.deepEqual(captured.observation.groundingMetadata, {
    groundingChunks: [
      { web: { uri: "https://example.com/a", title: "Example" } },
    ],
  });
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured.observation), true);
  assert.equal(Object.isFrozen(captured.observation.citations), true);
  assert.equal(Object.isFrozen(captured.observation.citations[0]), true);
});

test("preserves duplicate URLs as distinct citation occurrences", async () => {
  const raw = observation({
    citations: [
      {
        citationId: `${observationId}:grounding:0`,
        observationId,
        citedUrl: "https://example.com/a",
        sourceTitle: "First",
        capturedAt: observedAt,
        relationship: "source_list_only",
        verification: "not_checked",
        groundingChunkIndex: 0,
        urlStatus: "eligible",
        sourceDomain: "example.com",
        exclusionReason: null,
      },
      {
        citationId: `${observationId}:grounding:2`,
        observationId,
        citedUrl: "https://example.com/a",
        sourceTitle: "Second",
        capturedAt: observedAt,
        relationship: "source_list_only",
        verification: "not_checked",
        groundingChunkIndex: 2,
        urlStatus: "eligible",
        sourceDomain: "example.com",
        exclusionReason: null,
      },
    ],
  });
  let captured: ValidatedGroundedObservationPersistenceRequest | undefined;
  const result = await persistGroundedObservation(
    request(raw),
    gateway((value) => {
      captured = value;
    }),
  );

  assert.equal(result.ok, true);
  assert.ok(captured);
  assert.equal(captured.observation.citations.length, 2);
  assert.equal(
    captured.observation.citations[0]?.citedUrl,
    "https://example.com/a",
  );
  assert.equal(
    captured.observation.citations[1]?.citedUrl,
    "https://example.com/a",
  );
  assert.deepEqual(
    captured.observation.citations.map(
      (citation) => citation.groundingChunkIndex,
    ),
    [0, 2],
  );
});

test("accepts failed/cancelled evidence without converting it to a boundary failure", async () => {
  const failed = observation({
    captureMode: "not_executed",
    rawResponse: null,
    responseDigest: null,
    rawResponseState: "not_received",
    outcome: "failed",
    failureCode: "cancelled",
    answerText: null,
    finishReason: null,
    groundingMetadata: null,
    citations: [],
  });
  const result = await persistGroundedObservation(request(failed), gateway());
  assert.deepEqual(result, {
    ok: true,
    snapshot: {
      observationId,
      state: "cancelled",
      citationCount: 0,
      replayed: false,
    },
  });
});

test("rejects invalid lease/query identities before the gateway", async () => {
  const cases = [
    ["workspaceId", "not-a-uuid", "invalid_workspace_id"],
    ["scanId", "not-a-uuid", "invalid_scan_id"],
    ["attemptId", "not-a-uuid", "invalid_attempt_id"],
    ["workerId", "not-a-uuid", "invalid_worker_id"],
    ["leaseToken", "not-a-uuid", "invalid_lease_token"],
    ["queryOrdinal", -1, "invalid_query_ordinal"],
    ["queryOrdinal", 10, "invalid_query_ordinal"],
  ] as const;

  for (const [field, value, code] of cases) {
    let calls = 0;
    const result = await persistGroundedObservation(
      { ...request(), [field]: value },
      async () => {
        calls += 1;
        return { ok: false, code: "database_error" };
      },
    );
    assert.deepEqual(result, { ok: false, code });
    assert.equal(calls, 0);
  }
});

test("rejects malformed observation evidence before persistence", async () => {
  const invalid = [
    observation({ observationId: "forged" }),
    observation({ provider: "other" }),
    observation({ captureMode: "live_transport" }),
    observation({ observedAt: "not-a-time" }),
    observation({ responseDigest: "sha256:bad" }),
    observation({ outcome: "answered", failureCode: "provider_error" }),
    observation({ outcome: "failed", failureCode: null }),
    observation({ rawResponseState: "discarded", rawResponse: "payload" }),
    observation({
      citations: [
        {
          ...observation().citations[0],
          observationId: "e7000000-0000-4000-8000-000000000099",
        },
      ],
    }),
    observation({
      citations: [
        {
          ...observation().citations[0],
          groundingChunkIndex: 2,
        },
      ],
    }),
  ];

  for (const value of invalid) {
    let calls = 0;
    const result = await persistGroundedObservation(
      request(value),
      async () => {
        calls += 1;
        return { ok: false, code: "database_error" };
      },
    );
    assert.deepEqual(result, { ok: false, code: "invalid_observation" });
    assert.equal(calls, 0);
  }
});

test("preserves typed persistence failures", async () => {
  const failures = [
    "lease_not_found",
    "lease_expired",
    "identity_mismatch",
    "idempotency_conflict",
    "database_error",
    "invalid_database_response",
  ] as const;

  for (const code of failures) {
    const result = await persistGroundedObservation(request(), async () => ({
      ok: false,
      code,
    }));
    assert.deepEqual(result, { ok: false, code });
  }
});
