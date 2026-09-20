import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProjectScanLaunchRequest,
  type ProjectScanLaunchRequest,
} from "./project-scan-launch.ts";

const VALID_WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const VALID_PROJECT_ID = "20000000-0000-4000-8000-000000000001";
const VALID_WORKER_ID = "30000000-0000-4000-8000-000000000001";

function request(): ProjectScanLaunchRequest {
  return {
    workspaceId: VALID_WORKSPACE_ID,
    projectId: VALID_PROJECT_ID,
    workerId: VALID_WORKER_ID,
    leaseSeconds: 60,
  };
}

test("builds a bounded project scan request from verified ids", () => {
  const result = buildProjectScanLaunchRequest(request());

  assert.deepEqual(result.ok, true);
  if (!result.ok) throw new Error("expected valid request");

  assert.equal(result.value.workspaceId, VALID_WORKSPACE_ID);
  assert.equal(result.value.projectId, VALID_PROJECT_ID);
  assert.equal(result.value.workerId, VALID_WORKER_ID);
  assert.equal(result.value.leaseSeconds, 60);
  assert.equal(result.value.profileIdempotencyKey.length > 0, true);
  assert.equal(result.value.promptCohortIdempotencyKey.length > 0, true);
  assert.equal(result.value.reservationIdempotencyKey.length > 0, true);
  assert.equal(result.value.capturedAt.length > 0, true);
});

test("rejects invalid workspace or project ids before launch", () => {
  const invalidInputs: ProjectScanLaunchRequest[] = [
    {
      workspaceId: null,
      projectId: VALID_PROJECT_ID,
      workerId: VALID_WORKER_ID,
      leaseSeconds: 60,
    },
    {
      workspaceId: VALID_WORKSPACE_ID,
      projectId: null,
      workerId: VALID_WORKER_ID,
      leaseSeconds: 60,
    },
    {
      workspaceId: "not-a-uuid",
      projectId: VALID_PROJECT_ID,
      workerId: VALID_WORKER_ID,
      leaseSeconds: 60,
    },
    {
      workspaceId: VALID_WORKSPACE_ID,
      projectId: "not-a-uuid",
      workerId: VALID_WORKER_ID,
      leaseSeconds: 60,
    },
    {
      workspaceId: "  ",
      projectId: VALID_PROJECT_ID,
      workerId: VALID_WORKER_ID,
      leaseSeconds: 60,
    },
    {
      workspaceId: VALID_WORKSPACE_ID,
      projectId: "  ",
      workerId: VALID_WORKER_ID,
      leaseSeconds: 60,
    },
    {
      workspaceId: VALID_WORKSPACE_ID,
      projectId: VALID_PROJECT_ID,
      workerId: VALID_WORKER_ID,
      leaseSeconds: 10,
    },
    {
      workspaceId: VALID_WORKSPACE_ID,
      projectId: VALID_PROJECT_ID,
      workerId: VALID_WORKER_ID,
      leaseSeconds: 301,
    },
  ];

  for (const input of invalidInputs) {
    assert.deepEqual(buildProjectScanLaunchRequest(input), {
      ok: false,
      code: "invalid_project_scan_request",
    });
  }
});
