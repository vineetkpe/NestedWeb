import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorizeWorkspaceMembership,
  type WorkspaceAuthorizationGateway,
} from "./workspace-authorization.ts";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

function recordingGateway(requests: unknown[]): WorkspaceAuthorizationGateway {
  return async (request) => {
    requests.push(request);
    return {
      ok: true,
      membership: { workspaceId: request.workspaceId, role: "member" },
    };
  };
}

test("passes only a normalized workspace ID to the authorization gateway", async () => {
  const requests: unknown[] = [];

  const result = await authorizeWorkspaceMembership(
    {
      workspaceId: WORKSPACE_ID.toUpperCase(),
      userId: "caller-controlled-user",
      role: "owner",
    } as unknown as { workspaceId: unknown },
    recordingGateway(requests),
  );

  assert.deepEqual(result, {
    ok: true,
    membership: { workspaceId: WORKSPACE_ID, role: "member" },
  });
  assert.deepEqual(requests, [{ workspaceId: WORKSPACE_ID }]);
  assert.equal(Object.isFrozen(requests[0]), true);
});

test("rejects invalid workspace IDs before database access", async () => {
  const requests: unknown[] = [];
  const invalidIds = [
    null,
    "",
    "not-a-uuid",
    ` ${WORKSPACE_ID}`,
    "10000000-0000-0000-0000-000000000001",
  ];

  for (const workspaceId of invalidIds) {
    assert.deepEqual(
      await authorizeWorkspaceMembership(
        { workspaceId },
        recordingGateway(requests),
      ),
      { ok: false, code: "invalid_workspace_id" },
    );
  }

  assert.equal(requests.length, 0);
});

test("preserves a fresh not-member denial from the database boundary", async () => {
  const gateway: WorkspaceAuthorizationGateway = async () => ({
    ok: false,
    code: "not_member",
  });

  assert.deepEqual(
    await authorizeWorkspaceMembership({ workspaceId: WORKSPACE_ID }, gateway),
    { ok: false, code: "not_member" },
  );
});

test("preserves the current database membership role", async () => {
  const gateway: WorkspaceAuthorizationGateway = async (request) => ({
    ok: true,
    membership: { workspaceId: request.workspaceId, role: "owner" },
  });

  assert.deepEqual(
    await authorizeWorkspaceMembership({ workspaceId: WORKSPACE_ID }, gateway),
    {
      ok: true,
      membership: { workspaceId: WORKSPACE_ID, role: "owner" },
    },
  );
});
