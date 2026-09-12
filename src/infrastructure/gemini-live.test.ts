import assert from "node:assert/strict";
import { test } from "node:test";

import { createGeminiProvider, createLiveGeminiProvider } from "./gemini.ts";

const key = "test-only-live-gemini-credential";
const observedAt = "2026-09-12T14:50:00.000Z";
const request = {
  observationId: "a7000000-0000-4000-8000-000000000001",
  queryId: "niche-prompts-v1:live-test",
  queryVersion: "category@v1",
  queryText: "Which AI visibility tools are available?",
};

const body = JSON.stringify({
  responseId: "live-fixture-response",
  modelVersion: "gemini-live-test-001",
  candidates: [
    {
      content: { parts: [{ text: "Fixture answer" }] },
      finishReason: "STOP",
      groundingMetadata: {
        webSearchQueries: ["ai visibility tools"],
        groundingChunks: [
          { web: { uri: "https://example.com/source", title: "Example" } },
        ],
      },
    },
  ],
  usageMetadata: {
    promptTokenCount: 12,
    candidatesTokenCount: 5,
    thoughtsTokenCount: 3,
    totalTokenCount: 20,
  },
});

test("explicit live provider uses only the fixed Gemini HTTPS exchange", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (input, init) => {
    assert.equal(
      input,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-live-test:generateContent",
    );
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.referrerPolicy, "no-referrer");
    assert.deepEqual(init?.headers, {
      "x-goog-api-key": key,
      "Content-Type": "application/json",
    });
    assert.deepEqual(JSON.parse(String(init?.body)), {
      contents: [{ role: "user", parts: [{ text: request.queryText }] }],
      tools: [{ google_search: {} }],
      generationConfig: { candidateCount: 1, maxOutputTokens: 1234 },
    });
    return new Response(body, { status: 200 });
  });

  const setup = createLiveGeminiProvider({
    env: { GEMINI_API_KEY: key },
    model: "gemini-live-test",
    maxOutputTokens: 1234,
    now: () => observedAt,
  });
  assert.ok(setup.ok);
  assert.equal(setup.provider.capabilities.liveExecution, true);

  const result = await setup.provider.query(request);
  assert.ok(result.ok);
  assert.equal(fetch.mock.calls.length, 1);
  assert.equal(result.observation.observationId, request.observationId);
  assert.equal(result.observation.requestedModel, "gemini-live-test");
  assert.equal(result.observation.rawResponse, body);
  assert.equal(result.observation.outcome, "answered");
  assert.equal(result.observation.citations.length, 1);
});

test("closed provider remains network-disabled even after live transport exists", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("closed provider unexpectedly used network");
  });
  const setup = createGeminiProvider({
    env: { GEMINI_API_KEY: key },
    model: "gemini-live-test",
    now: () => observedAt,
  });
  assert.ok(setup.ok);
  assert.equal(setup.provider.capabilities.liveExecution, false);
  const result = await setup.provider.query(request);
  assert.ok(result.ok);
  assert.equal(result.observation.failureCode, "live_provider_unavailable");
  assert.equal(fetch.mock.calls.length, 0);
});

test("output token cap must be an explicit bounded safe integer", () => {
  for (const maxOutputTokens of [0, -1, 1.5, 65537, Number.MAX_SAFE_INTEGER]) {
    const setup = createLiveGeminiProvider({
      env: { GEMINI_API_KEY: key },
      model: "gemini-live-test",
      maxOutputTokens,
    });
    assert.deepEqual(setup, { ok: false, code: "invalid_max_output_tokens" });
  }
});
