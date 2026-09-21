import assert from "node:assert/strict";
import test from "node:test";

import type { Crawler } from "../../application/crawler.ts";
import type { SupabaseProjectBoundedScanRequest } from "../supabase-project-bounded-scan-runner.ts";
import {
  executeVerifiedProjectBoundedScan,
  runCurrentUserProjectBoundedScan,
  type VerifiedProjectBoundedScanDependencies,
} from "./project-bounded-scan-server.ts";

const workspaceId = "e1000000-0000-4000-8000-000000000001";
const projectId = "e2000000-0000-4000-8000-000000000001";
const workerId = "e3000000-0000-4000-8000-000000000001";

function request(): SupabaseProjectBoundedScanRequest {
  return {
    workspaceId,
    projectId,
    profileIdempotencyKey: "e4000000-0000-4000-8000-000000000001",
    promptCohortIdempotencyKey: "e5000000-0000-4000-8000-000000000001",
    reservationIdempotencyKey: "e6000000-0000-4000-8000-000000000001",
    capturedAt: "2026-09-14T05:15:00.000Z",
    workerId,
    leaseSeconds: 60,
  };
}

function inertCrawler(calls: string[]): Crawler {
  return Object.freeze({
    capabilities: Object.freeze({
      scope: "entry_page" as const,
      maxPages: 1 as const,
    }),
    async crawl() {
      calls.push("crawl");
      throw new Error("crawler must not run");
    },
  });
}

function dependencies(
  calls: string[],
  claims: unknown,
): VerifiedProjectBoundedScanDependencies {
  return {
    verifier: {
      auth: {
        async getClaims() {
          calls.push("auth:getClaims");
          return {
            data: claims === undefined ? null : { claims },
            error: null,
          };
        },
      },
    },
    async projectQuery(requestedWorkspaceId, requestedProjectId) {
      calls.push("project:query");
      assert.equal(requestedWorkspaceId, workspaceId);
      assert.equal(requestedProjectId, projectId);
      return { data: null, error: null };
    },
    async resolveAddresses() {
      calls.push("dns:resolve");
      throw new Error("DNS must not run");
    },
    crawler: inertCrawler(calls),
    async actorRpc() {
      calls.push("actor:rpc");
      throw new Error("actor RPC must not run");
    },
    async serviceRpc() {
      calls.push("service:rpc");
      throw new Error("service RPC must not run");
    },
    providerFactory() {
      calls.push("provider:factory");
      throw new Error("provider must not be configured");
    },
  };
}

test("verified composition denies signed-out actors before project, DNS, crawl, RPC or provider work", async () => {
  const calls: string[] = [];
  const result = await executeVerifiedProjectBoundedScan(
    request(),
    dependencies(calls, undefined),
  );

  assert.deepEqual(result, {
    state: "not_executed",
    stage: "authorization",
    failure: { ok: false, code: "signed_out" },
  });
  assert.deepEqual(calls, ["auth:getClaims"]);
});

test("verified actor reaches only the exact project boundary when the project is not RLS-visible", async () => {
  const calls: string[] = [];
  const result = await executeVerifiedProjectBoundedScan(
    request(),
    dependencies(calls, { sub: "verified-user" }),
  );

  assert.deepEqual(result, {
    state: "not_executed",
    stage: "project",
    failure: { ok: false, code: "project_access_denied" },
  });
  assert.deepEqual(calls, ["auth:getClaims", "project:query"]);
});

test("pre-cancelled verified composition performs no authentication or external work", async () => {
  const calls: string[] = [];
  const controller = new AbortController();
  controller.abort();

  const result = await executeVerifiedProjectBoundedScan(
    request(),
    dependencies(calls, { sub: "verified-user" }),
    controller.signal,
  );

  assert.deepEqual(result, {
    state: "not_executed",
    stage: "cancelled",
    failure: { ok: false, code: "cancelled" },
  });
  assert.deepEqual(calls, []);
});

test("request-scoped entry rejects missing or malformed service credentials before actor runtime", async () => {
  let providerCalls = 0;
  const providerFactory = () => {
    providerCalls += 1;
    return null;
  };

  assert.deepEqual(
    await runCurrentUserProjectBoundedScan(request(), providerFactory, {
      env: {},
    }),
    {
      state: "not_executed",
      stage: "server_setup",
      failure: { ok: false, code: "missing_supabase_secret_key" },
    },
  );
  assert.deepEqual(
    await runCurrentUserProjectBoundedScan(request(), providerFactory, {
      env: { SUPABASE_SECRET_KEY: "not-a-secret" },
    }),
    {
      state: "not_executed",
      stage: "server_setup",
      failure: { ok: false, code: "invalid_supabase_secret_key" },
    },
  );
  assert.equal(providerCalls, 0);
});

test("verified composition executes full scan pipeline up to gated provider execution", async () => {
  const calls: string[] = [];
  const scanId = "e7000000-0000-4000-8000-000000000001";
  const reservationId = "e9000000-0000-4000-8000-000000000001";
  const profileSnapshotId = "ea000000-0000-4000-8000-000000000001";
  const cohortId = "eb000000-0000-4000-8000-000000000001";
  const attemptId = "ed000000-0000-4000-8000-000000000001";
  const leaseToken = "ee000000-0000-4000-8000-000000000001";

  const fullDeps: VerifiedProjectBoundedScanDependencies = {
    verifier: {
      auth: {
        async getClaims() {
          calls.push("auth:getClaims");
          return { data: { claims: { sub: "verified-user" } }, error: null };
        },
      },
    },
    async projectQuery(requestedWorkspaceId, requestedProjectId) {
      calls.push("project:query");
      return {
        data: {
          id: requestedProjectId,
          workspace_id: requestedWorkspaceId,
          tracked_domain: "example.com",
        },
        error: null,
      };
    },
    async resolveAddresses() {
      calls.push("dns:resolve");
      return ["93.184.216.34"];
    },
    crawler: {
      capabilities: { scope: "entry_page", maxPages: 1 },
      async crawl() {
        calls.push("crawl");
        return {
          ok: true,
          pages: [
            {
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
            },
          ],
        };
      },
    },
    async actorRpc(name, args) {
      calls.push(`actorRpc:${name}`);
      const reservationArgs = args as Record<string, unknown>;
      return {
        data: {
          scanId,
          promptCohortId: reservationArgs.p_prompt_cohort_id,
          reservationId,
          reservedMicrounits: "42000",
          currency: "USD",
          provider: "gemini",
          modelId: "gemini-test-model",
          priceVersion: "price-v1",
          maxAttempts: 2,
          maxOutputTokens: 4096,
          requestFingerprint: "c".repeat(64),
          replayed: false,
        },
        error: null,
      };
    },
    async serviceRpc(name, args) {
      calls.push(`serviceRpc:${name}`);
      if (name === "persist_company_profile_snapshot") {
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
        return {
          data: {
            cohortId,
            profileSnapshotId,
            requestFingerprint: "b".repeat(64),
            queryCount: (promptArgs.p_prompts as readonly unknown[]).length,
            replayed: false,
          },
          error: null,
        };
      }
      if (name === "claim_scan_work_for_scan") {
        return {
          data: {
            claimId: "ec000000-0000-4000-8000-000000000001",
            workspaceId,
            projectId,
            scanId,
            attemptId,
            attemptNumber: 1,
            reservationId,
            workerId,
            leaseToken,
            provider: "gemini",
            modelId: "gemini-test-model",
            priceVersion: "price-v1",
            currency: "USD",
            reservedMicrounits: "42000",
            maxAttempts: 2,
            maxOutputTokens: 4096,
            leaseExpiresAt: "2026-09-14T05:20:00.000Z",
            queries: [
              {
                queryOrdinal: 0,
                queryId: "q1",
                queryVersion: "category@v1",
                queryText: "Which AI visibility tools are available?",
                observationId: "ea000000-0000-4000-8000-000000000002",
              },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    providerFactory() {
      calls.push("providerFactory");
      return null;
    },
  };

  const result = await executeVerifiedProjectBoundedScan(request(), fullDeps);

  assert.equal(result.state, "scan_attempted");
  if (result.state !== "scan_attempted")
    throw new Error("expected scan_attempted");
  assert.equal(result.project.trackedDomain, "example.com");
  assert.equal(result.scan.state, "execution_attempted");
  if (result.scan.state !== "execution_attempted")
    throw new Error("expected execution_attempted");
  assert.deepEqual(result.scan.execution, {
    ok: false,
    stage: "provider_setup",
    code: "provider_setup_failed",
  });
  assert.deepEqual(calls, [
    "auth:getClaims",
    "project:query",
    "dns:resolve",
    "crawl",
    "serviceRpc:persist_company_profile_snapshot",
    "serviceRpc:persist_prompt_cohort",
    "actorRpc:reserve_scan_from_cohort",
    "serviceRpc:claim_scan_work_for_scan",
    "providerFactory",
  ]);
});
