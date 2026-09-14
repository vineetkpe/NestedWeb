import assert from "node:assert/strict";
import test from "node:test";

import type { Crawler, CrawlResult } from "../application/crawler.ts";
import type { GroundedAIProvider } from "../application/grounded-ai-provider.ts";
import type { RawObservation } from "../domain/raw-observation.ts";
import {
  executeSupabaseProjectBoundedScan,
  type SupabaseProjectBoundedScanRequest,
} from "./supabase-project-bounded-scan-runner.ts";
import type { SupabaseBoundedScanServiceRpc } from "./supabase-bounded-scan-runner.ts";

const workspaceId = "d1000000-0000-4000-8000-000000000001";
const projectId = "d2000000-0000-4000-8000-000000000001";
const profileSnapshotId = "d3000000-0000-4000-8000-000000000001";
const cohortId = "d4000000-0000-4000-8000-000000000001";
const scanId = "d5000000-0000-4000-8000-000000000001";
const reservationId = "d6000000-0000-4000-8000-000000000001";
const workerId = "d7000000-0000-4000-8000-000000000001";
const attemptId = "d8000000-0000-4000-8000-000000000001";
const leaseToken = "d9000000-0000-4000-8000-000000000001";
const observationId = "da000000-0000-4000-8000-000000000001";

function request(): SupabaseProjectBoundedScanRequest {
  return {
    workspaceId,
    projectId,
    profileIdempotencyKey: "db000000-0000-4000-8000-000000000001",
    promptCohortIdempotencyKey: "dc000000-0000-4000-8000-000000000001",
    reservationIdempotencyKey: "dd000000-0000-4000-8000-000000000001",
    capturedAt: "2026-09-14T05:00:00.000Z",
    workerId,
    leaseSeconds: 60,
  };
}

function projectQuery(events: string[]) {
  return async (requestedWorkspaceId: string) => {
    events.push("project:query");
    assert.equal(requestedWorkspaceId, workspaceId);
    return {
      data: [
        {
          id: projectId,
          workspace_id: workspaceId,
          name: "Example project",
          tracked_domain: "example.com",
        },
      ],
      error: null,
    };
  };
}

const crawlResult: Extract<CrawlResult, { ok: true }> = Object.freeze({
  ok: true,
  pages: Object.freeze([
    Object.freeze({
      url: "https://example.com/",
      sourceUrl: "https://example.com",
      title: "Example Corp",
      description: "AI visibility software",
      language: "en",
      statusCode: 200,
      markdown: [
        "# About us",
        "Company name: Example Corp",
        "Product name: Example Visibility",
        "Industry: AI visibility software",
        "Target audience: Agencies",
        "Use case: Track AI citations",
        "Service area: India",
      ].join("\n"),
    }),
  ]),
});

function crawler(events: string[]): Crawler {
  return Object.freeze({
    capabilities: Object.freeze({ scope: "entry_page" as const, maxPages: 1 as const }),
    async crawl(target) {
      events.push("crawler:crawl");
      assert.equal(target.hostname, "example.com");
      assert.equal(target.origin, "https://example.com");
      assert.deepEqual(target.addresses, ["93.184.216.34"]);
      return crawlResult;
    },
  });
}

function provider(
  expectedPrompt: Readonly<{
    queryId: string;
    queryVersion: string;
    queryText: string;
  }>,
  events: string[],
): GroundedAIProvider {
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
      events.push("provider:query");
      assert.deepEqual(input, {
        observationId,
        queryId: expectedPrompt.queryId,
        queryVersion: expectedPrompt.queryVersion,
        queryText: expectedPrompt.queryText,
      });
      const observation: RawObservation = Object.freeze({
        observationId,
        queryId: expectedPrompt.queryId,
        queryVersion: expectedPrompt.queryVersion,
        queryText: expectedPrompt.queryText,
        provider: "gemini",
        surface: "api",
        captureVersion: "gemini-generate-content-v1",
        captureMode: "injected_transport",
        requestedModel: "gemini-bounded-test",
        modelVersion: "gemini-bounded-test",
        providerResponseId: "project-bounded-response",
        observedAt: "2026-09-14T05:00:01.000Z",
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

test("authorized durable project domain carries through crawl and exact durable scan settlement", async () => {
  const events: string[] = [];
  let persistedPrompts: readonly Record<string, unknown>[] = [];
  let persistedCrawlResult: unknown;

  const actorRpc = async (name: "reserve_scan_from_cohort", args: unknown) => {
    events.push(`actor:${name}`);
    const reservationArgs = args as Record<string, unknown>;
    return {
      data: {
        scanId,
        promptCohortId: reservationArgs.p_prompt_cohort_id,
        reservationId,
        reservedMicrounits: "42000",
        currency: "USD",
        provider: "gemini",
        modelId: "gemini-bounded-test",
        priceVersion: "price-v1",
        maxAttempts: 2,
        maxOutputTokens: 4096,
        requestFingerprint: "c".repeat(64),
        replayed: false,
      },
      error: null,
    };
  };

  const serviceRpc: SupabaseBoundedScanServiceRpc = async (name, args) => {
    events.push(`service:${name}`);
    if (name === "persist_company_profile_snapshot") {
      const profileArgs = args as Record<string, unknown>;
      persistedCrawlResult = profileArgs.p_crawl_result;
      return {
        data: {
          snapshotId: profileSnapshotId,
          requestFingerprint: "a".repeat(64),
          reviewState: "pending_review",
          replayed: false,
        },
        error: null,
      };
    }
    if (name === "persist_prompt_cohort") {
      const promptArgs = args as Record<string, unknown>;
      persistedPrompts = promptArgs.p_prompts as readonly Record<string, unknown>[];
      return {
        data: {
          cohortId,
          profileSnapshotId,
          requestFingerprint: "b".repeat(64),
          queryCount: persistedPrompts.length,
          replayed: false,
        },
        error: null,
      };
    }
    if (name === "claim_scan_work_for_scan") {
      const prompt = persistedPrompts[0];
      assert.ok(prompt);
      return {
        data: {
          workspaceId,
          projectId,
          scanId,
          reservationId,
          attemptId,
          attemptNumber: 1,
          workerId,
          leaseToken,
          leaseExpiresAt: "2026-09-14T05:01:00.000Z",
          provider: "gemini",
          modelId: "gemini-bounded-test",
          priceVersion: "price-v1",
          currency: "USD",
          reservedMicrounits: "42000",
          maxAttempts: 2,
          maxOutputTokens: 4096,
          queries: [
            {
              queryOrdinal: 0,
              queryId: prompt.queryId,
              queryVersion: prompt.templateVersion,
              queryText: prompt.text,
              observationId,
            },
          ],
        },
        error: null,
      };
    }
    if (name === "renew_scan_work_lease")
      return {
        data: {
          workspaceId,
          scanId,
          attemptId,
          workerId,
          leaseToken,
          leaseExpiresAt: "2026-09-14T05:01:30.000Z",
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
    throw new Error(`unexpected service RPC ${name}`);
  };

  const injected = { ...request(), website: "evil.example" };
  const result = await executeSupabaseProjectBoundedScan(
    injected,
    projectQuery(events),
    async (hostname) => {
      events.push("dns:resolve");
      assert.equal(hostname, "example.com");
      return ["93.184.216.34"];
    },
    crawler(events),
    actorRpc,
    serviceRpc,
    (config) => {
      assert.deepEqual(config, {
        provider: "gemini",
        modelId: "gemini-bounded-test",
        maxOutputTokens: 4096,
      });
      const prompt = persistedPrompts[0];
      assert.ok(prompt);
      return provider(
        {
          queryId: prompt.queryId as string,
          queryVersion: prompt.templateVersion as string,
          queryText: prompt.text as string,
        },
        events,
      );
    },
  );

  assert.equal(result.state, "scan_attempted");
  if (result.state !== "scan_attempted") throw new Error("expected scan attempt");
  assert.strictEqual(result.crawlResult, crawlResult);
  assert.equal(result.project.trackedDomain, "example.com");
  assert.equal(result.target.hostname, "example.com");
  assert.equal(result.scan.state, "execution_attempted");
  if (result.scan.state !== "execution_attempted")
    throw new Error("expected exact claim execution");
  assert.equal(result.scan.execution.ok, true);
  if (!result.scan.execution.ok) throw new Error("expected completed execution");
  assert.equal(result.scan.execution.state, "completed");
  assert.deepEqual(result.scan.execution.observationIds, [observationId]);
  assert.deepEqual(events, [
    "project:query",
    "dns:resolve",
    "crawler:crawl",
    "service:persist_company_profile_snapshot",
    "service:persist_prompt_cohort",
    "actor:reserve_scan_from_cohort",
    "service:claim_scan_work_for_scan",
    "service:renew_scan_work_lease",
    "provider:query",
    "service:persist_grounded_observation",
    "service:complete_scan_work",
  ]);
  assert.notStrictEqual(persistedCrawlResult, undefined);
});

test("missing authorized project stops before DNS, crawl, reservation or provider", async () => {
  const calls: string[] = [];
  let providerCalls = 0;
  const result = await executeSupabaseProjectBoundedScan(
    request(),
    async () => {
      calls.push("project");
      return { data: [], error: null };
    },
    async () => {
      calls.push("dns");
      return ["93.184.216.34"];
    },
    Object.freeze({
      capabilities: Object.freeze({ scope: "entry_page" as const, maxPages: 1 as const }),
      async crawl() {
        calls.push("crawl");
        return crawlResult;
      },
    }),
    async () => {
      calls.push("actor");
      throw new Error("must not reserve");
    },
    async () => {
      calls.push("service");
      throw new Error("must not persist");
    },
    () => {
      providerCalls += 1;
      throw new Error("must not configure provider");
    },
  );

  assert.equal(result.state, "not_executed");
  assert.equal(result.stage, "project");
  assert.deepEqual(result.failure, { ok: false, code: "project_access_denied" });
  assert.deepEqual(calls, ["project"]);
  assert.equal(providerCalls, 0);
});

test("unsafe DNS result stops before crawl and every durable scan call", async () => {
  const calls: string[] = [];
  let providerCalls = 0;
  const result = await executeSupabaseProjectBoundedScan(
    request(),
    projectQuery(calls),
    async () => {
      calls.push("dns");
      return ["127.0.0.1"];
    },
    Object.freeze({
      capabilities: Object.freeze({ scope: "entry_page" as const, maxPages: 1 as const }),
      async crawl() {
        calls.push("crawl");
        return crawlResult;
      },
    }),
    async () => {
      calls.push("actor");
      throw new Error("must not reserve");
    },
    async () => {
      calls.push("service");
      throw new Error("must not persist");
    },
    () => {
      providerCalls += 1;
      throw new Error("must not configure provider");
    },
  );

  assert.equal(result.state, "not_executed");
  assert.equal(result.stage, "target");
  assert.deepEqual(result.failure, { ok: false, code: "unsafe_address" });
  assert.deepEqual(calls, ["project:query", "dns"]);
  assert.equal(providerCalls, 0);
});

test("pre-cancelled project scan performs no external work", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;

  const result = await executeSupabaseProjectBoundedScan(
    request(),
    async () => {
      calls += 1;
      throw new Error("must not query project");
    },
    async () => {
      calls += 1;
      return ["93.184.216.34"];
    },
    crawler([]),
    async () => {
      calls += 1;
      throw new Error("must not reserve");
    },
    async () => {
      calls += 1;
      throw new Error("must not persist");
    },
    () => {
      calls += 1;
      throw new Error("must not configure provider");
    },
    controller.signal,
  );

  assert.deepEqual(result, {
    state: "not_executed",
    stage: "cancelled",
    failure: { ok: false, code: "cancelled" },
  });
  assert.equal(calls, 0);
});
