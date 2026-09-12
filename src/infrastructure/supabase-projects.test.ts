import assert from "node:assert/strict";
import { test } from "node:test";
import {
  executeSupabaseProjectCreate as executeCreate,
  executeSupabaseProjectList as executeList,
  type SupabaseProjectCreateRpc,
  type SupabaseProjectListQuery,
} from "./supabase-projects.ts";

const WORKSPACE_ID = "92000000-0000-4000-8000-000000000001";
const PROJECT_ID = "94000000-0000-4000-8000-000000000001";
const SECOND_PROJECT_ID = "94000000-0000-4000-8000-000000000002";
const IDEMPOTENCY_KEY = "93000000-0000-4000-8000-000000000001";

const CREATE_REQUEST = Object.freeze({
  workspaceId: WORKSPACE_ID,
  name: "Acme Cloud",
  trackedDomain: "acme.com",
  idempotencyKey: IDEMPOTENCY_KEY,
});
const LIST_REQUEST = Object.freeze({ workspaceId: WORKSPACE_ID });

test("calls the project RPC with the validated payload", async () => {
  const calls: unknown[] = [];
  const rpc: SupabaseProjectCreateRpc = async (args) => {
    calls.push(args);
    return { data: PROJECT_ID.toUpperCase(), error: null };
  };

  assert.deepEqual(await executeCreate(CREATE_REQUEST, rpc), {
    ok: true,
    projectId: PROJECT_ID,
  });
  assert.deepEqual(calls, [
    {
      p_workspace_id: WORKSPACE_ID,
      p_project_name: "Acme Cloud",
      p_tracked_domain: "acme.com",
      p_idempotency_key: IDEMPOTENCY_KEY,
    },
  ]);
});

test("maps exact project creation conflicts", async () => {
  const idempotencyConflict: SupabaseProjectCreateRpc = async () => ({
    data: null,
    error: {
      code: "22023",
      message: "Idempotency key reused with different project payload",
    },
  });
  const domainConflict: SupabaseProjectCreateRpc = async () => ({
    data: null,
    error: {
      code: "22023",
      message: "Tracked domain already exists in workspace",
    },
  });

  assert.deepEqual(await executeCreate(CREATE_REQUEST, idempotencyConflict), {
    ok: false,
    code: "idempotency_conflict",
  });
  assert.deepEqual(await executeCreate(CREATE_REQUEST, domainConflict), {
    ok: false,
    code: "project_already_exists",
  });
});

test("maps authorization and generic database failures", async () => {
  const denied: SupabaseProjectCreateRpc = async () => ({
    data: null,
    error: { code: "42501", message: "permission denied" },
  });
  const databaseError: SupabaseProjectCreateRpc = async () => ({
    data: null,
    error: { code: "P0001", message: "synthetic failure" },
  });
  const thrown: SupabaseProjectCreateRpc = async () => {
    throw new Error("synthetic transport failure");
  };

  assert.deepEqual(await executeCreate(CREATE_REQUEST, denied), {
    ok: false,
    code: "authorization_denied",
  });
  assert.deepEqual(await executeCreate(CREATE_REQUEST, databaseError), {
    ok: false,
    code: "database_error",
  });
  assert.deepEqual(await executeCreate(CREATE_REQUEST, thrown), {
    ok: false,
    code: "database_error",
  });
});

test("rejects malformed project creation responses", async () => {
  const malformedResponses: unknown[] = [
    null,
    [],
    "not-an-envelope",
    { data: null, error: null },
    { data: "not-a-uuid", error: null },
    { data: "94000000-0000-0000-0000-000000000001", error: null },
  ];

  for (const response of malformedResponses) {
    const rpc: SupabaseProjectCreateRpc = async () => response;
    assert.deepEqual(await executeCreate(CREATE_REQUEST, rpc), {
      ok: false,
      code: "invalid_database_response",
    });
  }
});

test("parses project lists in database order and freezes results", async () => {
  const calls: string[] = [];
  const query: SupabaseProjectListQuery = async (workspaceId) => {
    calls.push(workspaceId);
    return {
      data: [
        {
          id: PROJECT_ID,
          workspace_id: WORKSPACE_ID,
          name: "Acme Cloud",
          tracked_domain: "acme.com",
        },
        {
          id: SECOND_PROJECT_ID,
          workspace_id: WORKSPACE_ID,
          name: "Beta Cloud",
          tracked_domain: "beta.com",
        },
      ],
      error: null,
    };
  };

  const result = await executeList(LIST_REQUEST, query);
  assert.deepEqual(result, {
    ok: true,
    projects: [
      {
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        name: "Acme Cloud",
        trackedDomain: "acme.com",
      },
      {
        projectId: SECOND_PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        name: "Beta Cloud",
        trackedDomain: "beta.com",
      },
    ],
  });
  assert.deepEqual(calls, [WORKSPACE_ID]);
  if (result.ok) {
    assert.equal(Object.isFrozen(result.projects), true);
    assert.equal(Object.isFrozen(result.projects[0]), true);
  }
});

test("rejects malformed or cross-workspace project list rows", async () => {
  const malformedResponses: unknown[] = [
    null,
    { data: null, error: null },
    { data: [{}], error: null },
    {
      data: [
        {
          id: PROJECT_ID,
          workspace_id: "92000000-0000-4000-8000-000000000002",
          name: "Wrong tenant",
          tracked_domain: "wrong-tenant.com",
        },
      ],
      error: null,
    },
    {
      data: [
        {
          id: PROJECT_ID,
          workspace_id: WORKSPACE_ID,
          name: "Acme",
          tracked_domain: "acme.com",
        },
        {
          id: PROJECT_ID,
          workspace_id: WORKSPACE_ID,
          name: "Duplicate",
          tracked_domain: "duplicate.com",
        },
      ],
      error: null,
    },
  ];

  for (const response of malformedResponses) {
    const query: SupabaseProjectListQuery = async () => response;
    assert.deepEqual(await executeList(LIST_REQUEST, query), {
      ok: false,
      code: "invalid_database_response",
    });
  }
});

test("maps project list database errors", async () => {
  const denied: SupabaseProjectListQuery = async () => ({
    data: null,
    error: { code: "42501", message: "permission denied" },
  });
  const thrown: SupabaseProjectListQuery = async () => {
    throw new Error("synthetic transport failure");
  };

  assert.deepEqual(await executeList(LIST_REQUEST, denied), {
    ok: false,
    code: "authorization_denied",
  });
  assert.deepEqual(await executeList(LIST_REQUEST, thrown), {
    ok: false,
    code: "database_error",
  });
});
