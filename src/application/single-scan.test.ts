import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  GroundedAIProvider,
  GroundedQueryRequest,
  GroundedQueryResponse,
} from "./grounded-ai-provider.ts";
import { runSingleScan } from "./single-scan.ts";
import type {
  GeneratedPrompt,
  PromptCategory,
  PromptTemplateVersion,
} from "../domain/prompt-library.ts";
import type {
  ObservationFailureCode,
  RawObservation,
} from "../domain/raw-observation.ts";

function queryId(templateVersion: PromptTemplateVersion, text: string): string {
  return `niche-prompts-v1:${encodeURIComponent(
    JSON.stringify([templateVersion, "en", null, text]),
  )}`;
}

function plannedPrompt(
  category: PromptCategory,
  templateVersion: PromptTemplateVersion,
  text: string,
): GeneratedPrompt {
  return {
    queryId: queryId(templateVersion, text),
    category,
    text,
    templateVersion,
    language: "en",
    locale: null,
    state: "planned",
    evidenceRefs: [
      {
        field: "industry",
        valueIndex: 0,
        evidenceIndexes: [0],
      },
    ],
  };
}

const prompts = [
  plannedPrompt(
    "category-discovery",
    "category@v1",
    "Which tools are available for test analytics?",
  ),
  plannedPrompt(
    "best-tools-platforms",
    "best-audience@v1",
    "What are the best test analytics tools for agencies?",
  ),
  plannedPrompt(
    "buyer-intent",
    "buyer@v1",
    "What should agencies look for in test analytics tools?",
  ),
] as const;

const promptGeneration = {
  ok: true as const,
  methodVersion: "niche-prompts-v1" as const,
  profileMethodVersion: "company-profile-v2" as const,
  prompts,
};

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
  promptGeneration,
};

function executionQueries() {
  return prompts.map((prompt) => ({
    queryId: prompt.queryId,
    queryVersion: prompt.templateVersion,
    queryText: prompt.text,
  }));
}

test(
  "runs one coherent prompt cohort sequentially with complete distinct results",
  async () => {
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
    assert.equal(result.result.scanId, input.scanId);
    assert.equal(result.result.attemptId, input.attemptId);
    assert.equal(result.result.promptMethodVersion, "niche-prompts-v1");
    assert.equal(result.result.profileMethodVersion, "company-profile-v2");
    assert.deepEqual(
      seen.map(({ queryId, queryVersion, queryText }) => ({
        queryId,
        queryVersion,
        queryText,
      })),
      executionQueries(),
    );
    assert.deepEqual(
      result.result.queries.map((item) => item.prompt),
      prompts,
    );
    assert.deepEqual(
      result.result.queries.map((item) => item.query),
      executionQueries(),
    );
    const observationIds = result.result.queries.map(
      (item) => item.observationId,
    );
    assert.deepEqual(observationIds, [
      "attempt-test-1-q01",
      "attempt-test-1-q02",
      "attempt-test-1-q03",
    ]);
    assert.equal(new Set(observationIds).size, prompts.length);
    assert.equal(result.result.queries.length, prompts.length);
    assert.deepEqual(
      result.result.queries.map((item) => item.state),
      ["answered", "answered", "answered"],
    );
  },
);

test(
  "preserves refused, partial and failed provider observations without reinterpretation",
  async () => {
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
  },
);

test(
  "records provider boundary failures without fabricating observations and continues",
  async () => {
    let calls = 0;
    const result = await runSingleScan(
      input,
      fakeProvider(async (request) => {
        calls++;
        if (calls === 1) return { ok: false, code: "invalid_clock" };
        if (calls === 2)
          throw new Error("synthetic provider contract failure");
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
  },
);

test(
  "rejects a provider response that changes query or observation identity",
  async () => {
    const result = await runSingleScan(
      {
        ...input,
        promptGeneration: { ...promptGeneration, prompts: prompts.slice(0, 1) },
      },
      fakeProvider(async (request) => ({
        ok: true,
        observation: observation({ ...request, queryText: "changed" }),
      })),
    );

    assert.ok(result.ok);
    assert.equal(result.result.queries[0]?.state, "boundary_failure");
    assert.equal(result.result.queries[0]?.observation, null);
    assert.equal(result.result.queries[0]?.observationId, "attempt-test-1-q01");
  },
);

test(
  "pre-aborted scans make no provider calls and mark every query unattempted",
  async () => {
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
  },
);

test(
  "cancellation of the active query preserves its cancelled observation and leaves later queries unattempted",
  async () => {
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
  },
);

test("rejects more than ten prompts before provider execution", async () => {
  let calls = 0;
  const provider = fakeProvider(async (request) => {
    calls++;
    return { ok: true, observation: observation(request) };
  });
  const manyPrompts = Array.from({ length: 11 }, (_, index) =>
    plannedPrompt(
      "category-discovery",
      "category@v1",
      `Which tools are available for synthetic category ${index}?`,
    ),
  );
  const result = await runSingleScan(
    {
      scanId: "scan-test-1",
      attemptId: "attempt-test-1",
      promptGeneration: { ...promptGeneration, prompts: manyPrompts },
    },
    provider,
  );

  assert.deepEqual(result, { ok: false, code: "too_many_prompts" });
  assert.equal(calls, 0);
});

test(
  "rejects forged or internally inconsistent prompt cohorts before provider execution",
  async () => {
    let calls = 0;
    const provider = fakeProvider(async (request) => {
      calls++;
      return { ok: true, observation: observation(request) };
    });

    const badCohorts = [
      { ...promptGeneration, methodVersion: "future-method" },
      { ...promptGeneration, profileMethodVersion: "future-profile" },
      {
        ...promptGeneration,
        prompts: [{ ...prompts[0], queryId: "forged-query-id" }],
      },
      {
        ...promptGeneration,
        prompts: [{ ...prompts[0], category: "buyer-intent" }],
      },
      {
        ...promptGeneration,
        prompts: [{ ...prompts[0], evidenceRefs: [] }],
      },
      { ...promptGeneration, prompts: [prompts[0], prompts[0]] },
    ];

    for (const badCohort of badCohorts) {
      const result = await runSingleScan(
        {
          scanId: "scan-test-1",
          attemptId: "attempt-test-1",
          promptGeneration: badCohort,
        },
        provider,
      );
      assert.deepEqual(result, { ok: false, code: "invalid_prompt_cohort" });
    }
    assert.equal(calls, 0);
  },
);

test("snapshots mutable scan identity and prompt provenance before awaiting", async () => {
  const mutablePrompt = {
    ...prompts[0],
    evidenceRefs: [
      {
        field: "industry",
        valueIndex: 0,
        evidenceIndexes: [0],
      },
    ],
  };
  const mutableInput = {
    scanId: "scan-original",
    attemptId: "attempt-original",
    promptGeneration: {
      ...promptGeneration,
      prompts: [mutablePrompt],
    },
  };

  const result = await runSingleScan(
    mutableInput,
    fakeProvider(async (request) => {
      mutableInput.scanId = "scan-mutated";
      mutableInput.attemptId = "attempt-mutated";
      mutablePrompt.text = "mutated prompt";
      mutablePrompt.evidenceRefs[0]!.evidenceIndexes[0] = 99;
      return { ok: true, observation: observation(request) };
    }),
  );

  assert.ok(result.ok);
  assert.equal(result.result.scanId, "scan-original");
  assert.equal(result.result.attemptId, "attempt-original");
  assert.equal(result.result.queries[0]?.observationId, "attempt-original-q01");
  assert.equal(
    result.result.queries[0]?.prompt.text,
    "Which tools are available for test analytics?",
  );
  assert.deepEqual(
    result.result.queries[0]?.prompt.evidenceRefs[0]?.evidenceIndexes,
    [0],
  );
});

test("accepts an empty generated cohort without inventing work", async () => {
  let calls = 0;
  const result = await runSingleScan(
    {
      scanId: "scan-empty",
      attemptId: "attempt-empty",
      promptGeneration: { ...promptGeneration, prompts: [] },
    },
    fakeProvider(async (request) => {
      calls++;
      return { ok: true, observation: observation(request) };
    }),
  );

  assert.ok(result.ok);
  assert.equal(calls, 0);
  assert.deepEqual(result.result.queries, []);
});
