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
