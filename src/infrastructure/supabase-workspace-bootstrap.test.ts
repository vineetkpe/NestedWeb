import assert from "node:assert/strict";
import { test } from "node:test";
import type { ValidatedWorkspaceBootstrapRequest } from "../application/workspace-bootstrap.ts";
import {
  executeSupabaseWorkspaceBootstrap,
  type SupabaseWorkspaceBootstrapRpc,
} from "./supabase-workspace-bootstrap.ts";

const REQUEST: ValidatedWorkspaceBootstrapRequest = Object.freeze({
  workspaceName: "Agency North",
  idempotencyKey: "30000000-0000-4000-8000-000000000001",
});
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

test("calls the workspace RPC with only name and idempotency key", async () => {
  const calls: unknown[] = [];
  const rpc: SupabaseWorkspaceBootstrapRpc = async (args) => {
    calls.push(args);
    return { data: WORKSPACE_ID.toUpperCase(), error: null };
  };

  assert.deepEqual(await executeSupabaseWorkspaceBootstrap(REQUEST, rpc), {
    ok: true,
    workspaceId: WORKSPACE_ID,
  });
  assert.deepEqual(calls, [
    {
      p_workspace_name: "Agency North",
      p_idempotency_key: REQUEST.idempotencyKey,
    },
  ]);
});

test("maps an exact replay mismatch to idempotency conflict", async () => {
  const rpc: SupabaseWorkspaceBootstrapRpc = async () => ({
    data: null,
    error: {
      code: "22023",
      message: "Idempotency key reused with different workspace name",
    },
  });

  assert.deepEqual(await executeSupabaseWorkspaceBootstrap(REQUEST, rpc), {
    ok: false,
    code: "idempotency_conflict",
  });
});

test("does not over-classify unrelated invalid-parameter errors", async () => {
  const rpc: SupabaseWorkspaceBootstrapRpc = async () => ({
    data: null,
    error: { code: "22023", message: "some other invalid parameter" },
  });

  assert.deepEqual(await executeSupabaseWorkspaceBootstrap(REQUEST, rpc), {
    ok: false,
    code: "database_error",
  });
});

test("maps database authorization failures without exposing provider details", async () => {
  const rpc: SupabaseWorkspaceBootstrapRpc = async () => ({
    data: null,
    error: { code: "42501", message: "permission denied" },
  });

  assert.deepEqual(await executeSupabaseWorkspaceBootstrap(REQUEST, rpc), {
    ok: false,
    code: "authorization_denied",
  });
});

test("maps unknown database errors to a generic database failure", async () => {
  const rpc: SupabaseWorkspaceBootstrapRpc = async () => ({
    data: null,
    error: { code: "P0001", message: "synthetic failure" },
  });

  assert.deepEqual(await executeSupabaseWorkspaceBootstrap(REQUEST, rpc), {
    ok: false,
    code: "database_error",
  });
});

test("fails closed when the RPC throws", async () => {
  const rpc: SupabaseWorkspaceBootstrapRpc = async () => {
    throw new Error("synthetic transport failure");
  };

  assert.deepEqual(await executeSupabaseWorkspaceBootstrap(REQUEST, rpc), {
    ok: false,
    code: "database_error",
  });
});

test("rejects malformed RPC envelopes and workspace IDs", async () => {
  const malformedResponses: unknown[] = [
    null,
    [],
    "not-an-envelope",
    { data: null, error: null },
    { data: "not-a-uuid", error: null },
    { data: "10000000-0000-0000-0000-000000000001", error: null },
  ];

  for (const response of malformedResponses) {
    const rpc: SupabaseWorkspaceBootstrapRpc = async () => response;
    assert.deepEqual(await executeSupabaseWorkspaceBootstrap(REQUEST, rpc), {
      ok: false,
      code: "invalid_database_response",
    });
  }
});
