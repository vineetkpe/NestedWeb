import assert from "node:assert/strict";
import test from "node:test";

import {
  getWorkspaceQuotaSummary,
  verifyProjectCreationQuota,
  verifyScanExecutionQuota,
  type WorkspacePlanGateway,
} from "./plan-entitlements.ts";

const VALID_WORKSPACE_ID = "99999999-9999-4999-8999-999999999999";

function createMockGateway(
  tier: "free_tier" | "agency_starter" | "agency_pro",
  usage: { projectCount: number; monthScans: number; activeScans: number },
): WorkspacePlanGateway {
  return async (workspaceId: string) => {
    return {
      ok: true as const,
      usage: {
        workspaceId,
        tier,
        projectCount: usage.projectCount,
        monthScans: usage.monthScans,
        activeScans: usage.activeScans,
      },
    };
  };
}

test("verifyProjectCreationQuota validates workspace ID and enforces plan project limit", async () => {
  const gateway = createMockGateway("free_tier", {
    projectCount: 1,
    monthScans: 0,
    activeScans: 0,
  });

  // Rejects invalid UUID
  const invalidId = await verifyProjectCreationQuota(
    { workspaceId: "invalid-uuid" },
    gateway,
  );
  assert.equal(invalidId.ok, false);
  if (!invalidId.ok) {
    assert.equal(invalidId.code, "invalid_workspace_id");
  }

  // Free tier has max 1 project: 1 used -> blocked
  const blocked = await verifyProjectCreationQuota(
    { workspaceId: VALID_WORKSPACE_ID },
    gateway,
  );
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.code, "project_limit_reached");
    assert.equal(blocked.maxProjects, 1);
    assert.equal(blocked.currentCount, 1);
  }

  // Agency starter with 3 projects -> allowed
  const starterGateway = createMockGateway("agency_starter", {
    projectCount: 3,
    monthScans: 0,
    activeScans: 0,
  });
  const allowed = await verifyProjectCreationQuota(
    { workspaceId: VALID_WORKSPACE_ID },
    starterGateway,
  );
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.tier, "agency_starter");
    assert.equal(allowed.remainingProjects, 1);
  }
});

test("verifyScanExecutionQuota enforces query bounds, concurrency, and monthly quota", async () => {
  const gateway = createMockGateway("free_tier", {
    projectCount: 1,
    monthScans: 2,
    activeScans: 0,
  });

  // Rejects invalid queries
  const invalidQueries = await verifyScanExecutionQuota(
    { workspaceId: VALID_WORKSPACE_ID, requestedQueries: 0 },
    gateway,
  );
  assert.equal(invalidQueries.ok, false);
  if (!invalidQueries.ok) {
    assert.equal(invalidQueries.code, "invalid_query_count");
  }

  // Free tier query limit exceeded (requested 6, max is 5)
  const queryExceeded = await verifyScanExecutionQuota(
    { workspaceId: VALID_WORKSPACE_ID, requestedQueries: 6 },
    gateway,
  );
  assert.equal(queryExceeded.ok, false);
  if (!queryExceeded.ok) {
    assert.equal(queryExceeded.code, "query_limit_exceeded");
    assert.equal(queryExceeded.limit, 5);
  }

  // Valid execution on free tier
  const allowed = await verifyScanExecutionQuota(
    { workspaceId: VALID_WORKSPACE_ID, requestedQueries: 5 },
    gateway,
  );
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.tier, "free_tier");
    assert.equal(allowed.remainingScansThisMonth, 2);
  }
});

test("getWorkspaceQuotaSummary computes full quota metrics for the workspace", async () => {
  const gateway = createMockGateway("agency_pro", {
    projectCount: 10,
    monthScans: 100,
    activeScans: 2,
  });

  const result = await getWorkspaceQuotaSummary(
    { workspaceId: VALID_WORKSPACE_ID },
    gateway,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.summary.tier, "agency_pro");
    assert.equal(result.summary.planName, "Agency Pro");
    assert.equal(result.summary.projects.used, 10);
    assert.equal(result.summary.projects.max, 25);
    assert.equal(result.summary.projects.remaining, 15);
    assert.equal(result.summary.scans.usedThisMonth, 100);
    assert.equal(result.summary.scans.maxPerMonth, 250);
    assert.equal(result.summary.scans.remainingThisMonth, 150);
    assert.equal(result.summary.concurrency.active, 2);
    assert.equal(result.summary.concurrency.max, 5);
  }
});

test("service functions propagate gateway errors fail-closed", async () => {
  const failingGateway: WorkspacePlanGateway = async () => ({
    ok: false as const,
    code: "workspace_not_found" as const,
  });

  const projectResult = await verifyProjectCreationQuota(
    { workspaceId: VALID_WORKSPACE_ID },
    failingGateway,
  );
  assert.equal(projectResult.ok, false);
  if (!projectResult.ok) {
    assert.equal(projectResult.code, "workspace_not_found");
  }

  const scanResult = await verifyScanExecutionQuota(
    { workspaceId: VALID_WORKSPACE_ID, requestedQueries: 5 },
    failingGateway,
  );
  assert.equal(scanResult.ok, false);
  if (!scanResult.ok) {
    assert.equal(scanResult.code, "workspace_not_found");
  }
});
