import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProject,
  listProjects,
  type CreateProjectGateway,
  type ListProjectsGateway,
} from "./projects.ts";

const WORKSPACE_ID = "92000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "93000000-0000-4000-8000-000000000001";
const PROJECT_ID = "94000000-0000-4000-8000-000000000001";

test("normalizes project input and strips caller-controlled identity fields", async () => {
  const requests: unknown[] = [];
  const gateway: CreateProjectGateway = async (request) => {
    requests.push(request);
    return { ok: true, projectId: PROJECT_ID };
  };

  const result = await createProject(
    {
      workspaceId: WORKSPACE_ID.toUpperCase(),
      name: "Acme Cloud",
      website: "https://WWW.Acme.COM/pricing?plan=pro",
      idempotencyKey: IDEMPOTENCY_KEY.toUpperCase(),
      userId: "caller-controlled-user",
      createdBy: "caller-controlled-user",
      trackedDomain: "attacker.example",
    } as unknown as {
      workspaceId: unknown;
      name: unknown;
      website: unknown;
      idempotencyKey: unknown;
    },
    gateway,
  );

  assert.deepEqual(result, { ok: true, projectId: PROJECT_ID });
  assert.deepEqual(requests, [
    {
      workspaceId: WORKSPACE_ID,
      name: "Acme Cloud",
      trackedDomain: "www.acme.com",
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  ]);
  assert.equal(Object.isFrozen(requests[0]), true);
});

test("rejects invalid project names before gateway access", async () => {
  const calls: unknown[] = [];
  const gateway: CreateProjectGateway = async (request) => {
    calls.push(request);
    return { ok: true, projectId: PROJECT_ID };
  };
  const invalidNames = ["", " Acme", "Acme ", " ", "a".repeat(121)];

  for (const name of invalidNames) {
    assert.deepEqual(
      await createProject(
        {
          workspaceId: WORKSPACE_ID,
          name,
          website: "acme.com",
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        gateway,
      ),
      { ok: false, code: "invalid_project_name" },
    );
  }

  assert.equal(calls.length, 0);
});

test("rejects malformed workspace and idempotency identifiers", async () => {
  const calls: unknown[] = [];
  const gateway: CreateProjectGateway = async (request) => {
    calls.push(request);
    return { ok: true, projectId: PROJECT_ID };
  };

  assert.deepEqual(
    await createProject(
      {
        workspaceId: "not-a-uuid",
        name: "Acme",
        website: "acme.com",
        idempotencyKey: IDEMPOTENCY_KEY,
      },
      gateway,
    ),
    { ok: false, code: "invalid_workspace_id" },
  );
  assert.deepEqual(
    await createProject(
      {
        workspaceId: WORKSPACE_ID,
        name: "Acme",
        website: "acme.com",
        idempotencyKey: "not-a-uuid",
      },
      gateway,
    ),
    { ok: false, code: "invalid_idempotency_key" },
  );
  assert.equal(calls.length, 0);
});

test("preserves website validation detail without crossing the gateway", async () => {
  const gateway: CreateProjectGateway = async () => {
    throw new Error("gateway should not be called");
  };

  assert.deepEqual(
    await createProject(
      {
        workspaceId: WORKSPACE_ID,
        name: "Acme",
        website: "http://127.0.0.1",
        idempotencyKey: IDEMPOTENCY_KEY,
      },
      gateway,
    ),
    { ok: false, code: "invalid_website", reason: "host_not_allowed" },
  );
});

test("preserves project gateway conflicts", async () => {
  const gateway: CreateProjectGateway = async () => ({
    ok: false,
    code: "project_already_exists",
  });

  assert.deepEqual(
    await createProject(
      {
        workspaceId: WORKSPACE_ID,
        name: "Acme",
        website: "acme.com",
        idempotencyKey: IDEMPOTENCY_KEY,
      },
      gateway,
    ),
    { ok: false, code: "project_already_exists" },
  );
});

test("normalizes list scope and strips injected identity fields", async () => {
  const requests: unknown[] = [];
  const gateway: ListProjectsGateway = async (request) => {
    requests.push(request);
    return { ok: true, projects: [] };
  };

  const result = await listProjects(
    {
      workspaceId: WORKSPACE_ID.toUpperCase(),
      userId: "caller-controlled-user",
      role: "owner",
    } as unknown as { workspaceId: unknown },
    gateway,
  );

  assert.deepEqual(result, { ok: true, projects: [] });
  assert.deepEqual(requests, [{ workspaceId: WORKSPACE_ID }]);
  assert.equal(Object.isFrozen(requests[0]), true);
});

test("rejects invalid list workspace IDs before gateway access", async () => {
  const calls: unknown[] = [];
  const gateway: ListProjectsGateway = async (request) => {
    calls.push(request);
    return { ok: true, projects: [] };
  };

  assert.deepEqual(await listProjects({ workspaceId: "bad" }, gateway), {
    ok: false,
    code: "invalid_workspace_id",
  });
  assert.equal(calls.length, 0);
});
