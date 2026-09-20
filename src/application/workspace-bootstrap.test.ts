import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bootstrapWorkspace,
  type WorkspaceBootstrapGateway,
} from "./workspace-bootstrap.ts";

const VALID_KEY = "30000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

function recordingGateway(requests: unknown[]): WorkspaceBootstrapGateway {
  return async (request) => {
    requests.push(request);
    return { ok: true, workspaceId: WORKSPACE_ID };
  };
}

test("passes only validated workspace bootstrap fields to the gateway", async () => {
  const requests: unknown[] = [];

  const result = await bootstrapWorkspace(
    {
      workspaceName: "Agency North",
      idempotencyKey: VALID_KEY.toUpperCase(),
      userId: "caller-controlled-user",
    } as unknown as {
      workspaceName: unknown;
      idempotencyKey: unknown;
    },
    recordingGateway(requests),
  );

  assert.deepEqual(result, { ok: true, workspaceId: WORKSPACE_ID });
  assert.deepEqual(requests, [
    {
      workspaceName: "Agency North",
      idempotencyKey: VALID_KEY,
    },
  ]);
  assert.equal(Object.isFrozen(requests[0]), true);
});

test("rejects invalid workspace names before database access", async () => {
  const requests: unknown[] = [];
  const invalidNames = ["", " Agency", "Agency ", " ", "a".repeat(121)];

  for (const workspaceName of invalidNames) {
    assert.deepEqual(
      await bootstrapWorkspace(
        { workspaceName, idempotencyKey: VALID_KEY },
        recordingGateway(requests),
      ),
      { ok: false, code: "invalid_workspace_name" },
    );
  }

  assert.equal(requests.length, 0);
});

test("rejects malformed idempotency keys before database access", async () => {
  const requests: unknown[] = [];
  const invalidKeys = [
    null,
    "",
    "not-a-uuid",
    ` ${VALID_KEY}`,
    "30000000-0000-0000-0000-000000000001",
  ];

  for (const idempotencyKey of invalidKeys) {
    assert.deepEqual(
      await bootstrapWorkspace(
        { workspaceName: "Agency North", idempotencyKey },
        recordingGateway(requests),
      ),
      { ok: false, code: "invalid_idempotency_key" },
    );
  }

  assert.equal(requests.length, 0);
});

test("preserves idempotency conflicts from the database boundary", async () => {
  const gateway: WorkspaceBootstrapGateway = async () => ({
    ok: false,
    code: "idempotency_conflict",
  });

  assert.deepEqual(
    await bootstrapWorkspace(
      { workspaceName: "Agency North", idempotencyKey: VALID_KEY },
      gateway,
    ),
    { ok: false, code: "idempotency_conflict" },
  );
});

test("validates workspace name length by Unicode code point", async () => {
  const requests: unknown[] = [];
  const name = "é".repeat(120);

  assert.deepEqual(
    await bootstrapWorkspace(
      { workspaceName: name, idempotencyKey: VALID_KEY },
      recordingGateway(requests),
    ),
    { ok: true, workspaceId: WORKSPACE_ID },
  );
  assert.equal(requests.length, 1);
});
