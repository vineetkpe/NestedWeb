import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ValidatedWorkspaceAuthorizationRequest,
} from "../application/workspace-authorization.ts";
import {
  executeSupabaseWorkspaceAuthorization,
  type SupabaseWorkspaceMembershipQuery,
} from "./supabase-workspace-authorization.ts";

const REQUEST: ValidatedWorkspaceAuthorizationRequest = Object.freeze({
  workspaceId: "10000000-0000-4000-8000-000000000001",
});

test("returns the current membership row for the requested workspace", async () => {
  const calls: string[] = [];
  const query: SupabaseWorkspaceMembershipQuery = async (workspaceId) => {
    calls.push(workspaceId);
    return {
      data: { workspace_id: workspaceId, role: "owner" },
      error: null,
    };
  };

  assert.deepEqual(
    await executeSupabaseWorkspaceAuthorization(REQUEST, query),
    {
      ok: true,
      membership: { workspaceId: REQUEST.workspaceId, role: "owner" },
    },
  );
  assert.deepEqual(calls, [REQUEST.workspaceId]);
});

test("treats an absent membership row as authorization denial", async () => {
  const query: SupabaseWorkspaceMembershipQuery = async () => ({
    data: null,
    error: null,
  });

  assert.deepEqual(
    await executeSupabaseWorkspaceAuthorization(REQUEST, query),
    {
      ok: false,
      code: "not_member",
    },
  );
});

test("fails closed on database errors and thrown queries", async () => {
  const databaseError: SupabaseWorkspaceMembershipQuery = async () => ({
    data: null,
    error: { code: "42501", message: "permission denied" },
  });
  const thrownQuery: SupabaseWorkspaceMembershipQuery = async () => {
    throw new Error("synthetic transport failure");
  };

  assert.deepEqual(
    await executeSupabaseWorkspaceAuthorization(REQUEST, databaseError),
    { ok: false, code: "database_error" },
  );
  assert.deepEqual(
    await executeSupabaseWorkspaceAuthorization(REQUEST, thrownQuery),
    { ok: false, code: "database_error" },
  );
});

test("rejects malformed membership rows and envelopes", async () => {
  const malformedResponses: unknown[] = [
    null,
    [],
    "not-an-envelope",
    { data: [], error: null },
    { data: {}, error: null },
    {
      data: { workspace_id: REQUEST.workspaceId, role: "admin" },
      error: null,
    },
    {
      data: {
        workspace_id: "10000000-0000-4000-8000-000000000002",
        role: "member",
      },
      error: null,
    },
  ];

  for (const response of malformedResponses) {
    const query: SupabaseWorkspaceMembershipQuery = async () => response;
    assert.deepEqual(
      await executeSupabaseWorkspaceAuthorization(REQUEST, query),
      { ok: false, code: "invalid_database_response" },
    );
  }
});

test("freezes an accepted membership result", async () => {
  const query: SupabaseWorkspaceMembershipQuery = async () => ({
    data: { workspace_id: REQUEST.workspaceId, role: "member" },
    error: null,
  });

  const result = await executeSupabaseWorkspaceAuthorization(REQUEST, query);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(Object.isFrozen(result.membership), true);
});
