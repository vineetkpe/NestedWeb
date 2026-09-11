import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  GroundedAIProvider,
  GroundedQueryRequest,
  GroundedQueryResponse,
} from "./grounded-ai-provider.ts";
import { runSingleScan } from "./single-scan.ts";
import type {
  ObservationFailureCode,
  RawObservation,
} from "../domain/raw-observation.ts";

const prompts = [
  {
    queryId: "query-1",
    queryVersion: "category@v1",
    queryText: "Which tools are available for test analytics?",
  },
  {
    queryId: "query-2",
    queryVersion: "best-audience@v1",
    queryText: "What are the best test analytics tools for agencies?",
  },
  {
    queryId: "query-3",
    queryVersion: "buyer@v1",
    queryText: "What should agencies look for in test analytics tools?",
  },
] as const;

const capabilities = Object.freeze({
  provider: "gemini" as const,
  surface: "api" as const,
  grounding: "google_search" as const,
  liveExecution: false as const,
  maxQueries: 1 as const,
  maxCitations: 50 as const,
});

function observation(
  request: GroundedQueryRequest,
  outcome: RawObservation["outcome"] = "answered",
  failureCode: ObservationFailureCode | null = null,
): RawObservation {
  return {
    ...request,
    provider: "gemini",
    surface: "api",
    captureVersion: "gemini-generate-content-v1",
    captureMode: "not_executed",
    requestedModel: "gemini-test-only",
    modelVersion: null,
    providerResponseId: null,
    observedAt: "2026-09-12T00:00:00.000Z",
    rawResponse: null,
    responseDigest: null,
    rawResponseState: "not_received",
    outcome,
    failureCode,
    answerText: outcome === "answered" ? "Synthetic test answer." : null,
    finishReason: null,
    groundingMetadata: null,
    citations: [],
  };
}

function fakeProvider(
  query: (
    request: GroundedQueryRequest,
    signal?: AbortSignal,
  ) => Promise<GroundedQueryResponse>,
): GroundedAIProvider {
  return { capabilities, query };
}

const input = {
  scanId: "scan-test-1",
  attemptId: "attempt-test-1",
  prompts,
};

test("runs at most ten prompts sequentially and preserves exact query order and identity", async () => {
  let active = 0;
  let maxActive = 0;
  const seen: GroundedQueryRequest[] = [];
  const provider = fakeProvider(async (request) => {
    active++;
    maxActive = Math.max(maxActive, active);
    seen.push(request);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return { ok: true, observation: observation(request) };
  });

  const result = await runSingleScan(input, provider);
  assert.ok(result.ok);
  assert.equal(maxActive, 1);
  assert.deepEqual(
    seen.map(({ queryId, queryVersion, queryText }) => ({
      queryId,
      queryVersion,
      queryText,
    })),
    prompts,
  );
  assert.deepEqual(
    result.result.queries.map((item) => item.observationId),
    ["attempt-test-1-q01", "attempt-test-1-q02", "attempt-test-1-q03"],
  );
  assert.deepEqual(
    result.result.queries.map((item) => item.state),
    ["answered", "answered", "answered"],
  );
});

test("preserves refused, partial and failed provider observations without reinterpretation", async () => {
  const outcomes = [
    ["refused", null],
    ["partial", null],
    ["failed", "provider_error"],
  ] as const;
  let index = 0;
  const result = await runSingleScan(
    input,
    fakeProvider(async (request) => {
      const current = outcomes[index++];
      assert.ok(current);
      return {
        ok: true,
        observation: observation(request, current[0], current[1]),
      };
    }),
  );

  assert.ok(result.ok);
  assert.deepEqual(
    result.result.queries.map((item) => item.state),
    ["refused", "partial", "failed"],
  );
  for (const item of result.result.queries)
    assert.notEqual(item.observation, null);
});

test("records provider boundary failures without fabricating observations and continues", async () => {
  let calls = 0;
  const result = await runSingleScan(
    input,
    fakeProvider(async (request) => {
      calls++;
      if (calls === 1) return { ok: false, code: "invalid_clock" };
      if (calls === 2) throw new Error("synthetic provider contract failure");
      return { ok: true, observation: observation(request) };
    }),
  );

  assert.ok(result.ok);
  assert.equal(result.result.queries[0]?.state, "boundary_failure");
  assert.equal(result.result.queries[0]?.observation, null);
  assert.equal(result.result.queries[1]?.state, "boundary_failure");
  assert.equal(result.result.queries[1]?.observation, null);
  assert.equal(result.result.queries[2]?.state, "answered");
  assert.equal(calls, 3);
});

test("rejects a provider response that changes query or observation identity", async () => {
  const result = await runSingleScan(
    { ...input, prompts: prompts.slice(0, 1) },
    fakeProvider(async (request) => ({
      ok: true,
      observation: observation({ ...request, queryText: "changed" }),
    })),
  );

  assert.ok(result.ok);
  assert.deepEqual(result.result.queries[0], {
    state: "boundary_failure",
    query: prompts[0],
    observationId: "attempt-test-1-q01",
    observation: null,
    code: "provider_exception",
  });
});

test("pre-aborted scans make no provider calls and mark every query unattempted", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const result = await runSingleScan(
    input,
    fakeProvider(async (request) => {
      calls++;
      return { ok: true, observation: observation(request) };
    }),
    controller.signal,
  );

  assert.ok(result.ok);
  assert.equal(calls, 0);
  assert.deepEqual(
    result.result.queries.map((item) => item.state),
    ["unattempted", "unattempted", "unattempted"],
  );
});

test("cancellation of the active query preserves its cancelled observation and leaves later queries unattempted", async () => {
  const controller = new AbortController();
  let calls = 0;
  let receivedSignal: AbortSignal | undefined;
  const result = await runSingleScan(
    input,
    fakeProvider(async (request, signal) => {
      calls++;
      receivedSignal = signal;
      controller.abort();
      return {
        ok: true,
        observation: observation(request, "failed", "cancelled"),
      };
    }),
    controller.signal,
  );

  assert.ok(result.ok);
  assert.equal(receivedSignal, controller.signal);
  assert.equal(calls, 1);
  assert.deepEqual(
    result.result.queries.map((item) => item.state),
    ["cancelled", "unattempted", "unattempted"],
  );
});

test("rejects more than ten prompts before provider execution", async () => {
  let calls = 0;
  const provider = fakeProvider(async (request) => {
    calls++;
    return { ok: true, observation: observation(request) };
  });
  const result = await runSingleScan(
    {
      scanId: "scan-test-1",
      attemptId: "attempt-test-1",
      prompts: Array.from({ length: 11 }, (_, index) => ({
        queryId: `query-${index}`,
        queryVersion: "category@v1",
        queryText: `Synthetic prompt ${index}`,
      })),
    },
    provider,
  );

  assert.deepEqual(result, { ok: false, code: "too_many_prompts" });
  assert.equal(calls, 0);
});

test("rejects duplicate or malformed prompt identity before provider execution", async () => {
  let calls = 0;
  const provider = fakeProvider(async (request) => {
    calls++;
    return { ok: true, observation: observation(request) };
  });

  for (const badPrompts of [
    [prompts[0], prompts[0]],
    [{ queryId: "", queryVersion: "category@v1", queryText: "Valid" }],
    [{ queryId: "q", queryVersion: "", queryText: "Valid" }],
    [{ queryId: "q", queryVersion: "category@v1", queryText: "" }],
  ]) {
    const result = await runSingleScan(
      { scanId: "scan-test-1", attemptId: "attempt-test-1", prompts: badPrompts },
      provider,
    );
    assert.deepEqual(result, { ok: false, code: "invalid_prompts" });
  }
  assert.equal(calls, 0);
});
