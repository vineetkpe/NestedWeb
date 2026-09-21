import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClaimsVerifier } from "../supabase-auth.ts";
import {
  executeVerifiedCurrentUserProjectCreate,
  executeVerifiedCurrentUserProjectList,
  type VerifiedProjectCreateDependencies,
  type VerifiedProjectListDependencies,
} from "./projects-server.ts";

const WORKSPACE_ID = "92000000-0000-4000-8000-000000000001";
const PROJECT_ID = "94000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "93000000-0000-4000-8000-000000000001";

function makeVerifier(
  claims?: { sub: string } | null,
  error: unknown = null,
): SupabaseClaimsVerifier {
  return {
    auth: {
      async getClaims() {
        return {
          data: claims ? { claims } : null,
          error,
        };
      },
    },
  };
}

test("executeVerifiedCurrentUserProjectList denies signed-out actors before membership or project query", async () => {
  const calls: string[] = [];
  const dependencies: VerifiedProjectListDependencies = {
    verifier: makeVerifier(null),
    async membershipQuery() {
      calls.push("membership");
      return { data: null, error: null };
    },
    async projectListQuery() {
      calls.push("projects");
      return { data: [], error: null };
    },
  };

  const result = await executeVerifiedCurrentUserProjectList(
    { workspaceId: WORKSPACE_ID },
    dependencies,
  );

  assert.deepEqual(result, {
    ok: false,
    code: "authorization_denied",
  });
  assert.deepEqual(calls, []);
});

test("executeVerifiedCurrentUserProjectList denies non-members before loading projects", async () => {
  const calls: string[] = [];
  const dependencies: VerifiedProjectListDependencies = {
    verifier: makeVerifier({ sub: "user-test-1" }),
    async membershipQuery(workspaceId) {
      calls.push(`membership:${workspaceId}`);
      return { data: null, error: null };
    },
    async projectListQuery() {
      calls.push("projects");
      return { data: [], error: null };
    },
  };

  const result = await executeVerifiedCurrentUserProjectList(
    { workspaceId: WORKSPACE_ID },
    dependencies,
  );

  assert.deepEqual(result, {
    ok: false,
    code: "not_member",
  });
  assert.deepEqual(calls, [`membership:${WORKSPACE_ID}`]);
});

test("executeVerifiedCurrentUserProjectList returns project list for authorized workspace members", async () => {
  const calls: string[] = [];
  const dependencies: VerifiedProjectListDependencies = {
    verifier: makeVerifier({ sub: "user-test-1" }),
    async membershipQuery(workspaceId) {
      calls.push(`membership:${workspaceId}`);
      return {
        data: { workspace_id: workspaceId, role: "member" },
        error: null,
      };
    },
    async projectListQuery(workspaceId) {
      calls.push(`projects:${workspaceId}`);
      return {
        data: [
          {
            id: PROJECT_ID,
            workspace_id: workspaceId,
            name: "Acme App",
            tracked_domain: "acme.com",
          },
        ],
        error: null,
      };
    },
  };

  const result = await executeVerifiedCurrentUserProjectList(
    { workspaceId: WORKSPACE_ID },
    dependencies,
  );

  assert.deepEqual(result, {
    ok: true,
    projects: [
      {
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        name: "Acme App",
        trackedDomain: "acme.com",
      },
    ],
  });
  assert.deepEqual(calls, [
    `membership:${WORKSPACE_ID}`,
    `projects:${WORKSPACE_ID}`,
  ]);
});

test("executeVerifiedCurrentUserProjectList rejects invalid workspace UUID without reaching auth or DB", async () => {
  let verifierCalled = false;
  const dependencies: VerifiedProjectListDependencies = {
    verifier: {
      auth: {
        async getClaims() {
          verifierCalled = true;
          return { data: { claims: { sub: "user-test-1" } }, error: null };
        },
      },
    },
    async membershipQuery() {
      throw new Error("membership query must not run");
    },
    async projectListQuery() {
      throw new Error("projects query must not run");
    },
  };

  const result = await executeVerifiedCurrentUserProjectList(
    { workspaceId: "invalid-uuid" },
    dependencies,
  );

  assert.deepEqual(result, {
    ok: false,
    code: "invalid_workspace_id",
  });
  assert.equal(verifierCalled, true);
});

test("executeVerifiedCurrentUserProjectCreate denies signed-out actors before membership or project RPC", async () => {
  const calls: string[] = [];
  const dependencies: VerifiedProjectCreateDependencies = {
    verifier: makeVerifier(null),
    async membershipQuery() {
      calls.push("membership");
      return { data: null, error: null };
    },
    async projectCreateRpc() {
      calls.push("rpc");
      return { data: null, error: null };
    },
  };

  const result = await executeVerifiedCurrentUserProjectCreate(
    {
      workspaceId: WORKSPACE_ID,
      name: "Acme App",
      website: "https://acme.com",
      idempotencyKey: IDEMPOTENCY_KEY,
    },
    dependencies,
  );

  assert.deepEqual(result, {
    ok: false,
    code: "authorization_denied",
  });
  assert.deepEqual(calls, []);
});

test("executeVerifiedCurrentUserProjectCreate denies non-members before creating project", async () => {
  const calls: string[] = [];
  const dependencies: VerifiedProjectCreateDependencies = {
    verifier: makeVerifier({ sub: "user-test-1" }),
    async membershipQuery(workspaceId) {
      calls.push(`membership:${workspaceId}`);
      return { data: null, error: null };
    },
    async projectCreateRpc() {
      calls.push("rpc");
      return { data: null, error: null };
    },
  };

  const result = await executeVerifiedCurrentUserProjectCreate(
    {
      workspaceId: WORKSPACE_ID,
      name: "Acme App",
      website: "https://acme.com",
      idempotencyKey: IDEMPOTENCY_KEY,
    },
    dependencies,
  );

  assert.deepEqual(result, {
    ok: false,
    code: "not_member",
  });
  assert.deepEqual(calls, [`membership:${WORKSPACE_ID}`]);
});

test("executeVerifiedCurrentUserProjectCreate creates project for authorized member", async () => {
  const calls: string[] = [];
  const dependencies: VerifiedProjectCreateDependencies = {
    verifier: makeVerifier({ sub: "user-test-1" }),
    async membershipQuery(workspaceId) {
      calls.push(`membership:${workspaceId}`);
      return {
        data: { workspace_id: workspaceId, role: "owner" },
        error: null,
      };
    },
    async projectCreateRpc(args) {
      calls.push(
        `create_project:${args.p_project_name}:${args.p_tracked_domain}`,
      );
      return { data: PROJECT_ID, error: null };
    },
  };

  const result = await executeVerifiedCurrentUserProjectCreate(
    {
      workspaceId: WORKSPACE_ID,
      name: "Acme App",
      website: "https://acme.com",
      idempotencyKey: IDEMPOTENCY_KEY,
    },
    dependencies,
  );

  assert.deepEqual(result, {
    ok: true,
    projectId: PROJECT_ID,
  });
  assert.deepEqual(calls, [
    `membership:${WORKSPACE_ID}`,
    "create_project:Acme App:acme.com",
  ]);
});
