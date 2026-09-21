import {
  calculateUsageQuota,
  checkProjectCreationEntitlement,
  checkScanExecutionEntitlement,
  type PlanTier,
  type UsageQuotaSummary,
} from "../domain/plan-entitlements.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspacePlanUsageSnapshot = Readonly<{
  workspaceId: string;
  tier: PlanTier;
  projectCount: number;
  monthScans: number;
  activeScans: number;
}>;

export type WorkspacePlanGatewayResult =
  | Readonly<{ ok: true; usage: WorkspacePlanUsageSnapshot }>
  | Readonly<{
      ok: false;
      code:
        "workspace_not_found" | "database_error" | "invalid_database_response";
    }>;

export type WorkspacePlanGateway = (
  workspaceId: string,
) => Promise<WorkspacePlanGatewayResult>;

export type ProjectCreationQuotaResult =
  | Readonly<{
      ok: true;
      tier: PlanTier;
      remainingProjects: number;
    }>
  | Readonly<{
      ok: false;
      code: "invalid_workspace_id";
    }>
  | Readonly<{
      ok: false;
      code: "project_limit_reached";
      maxProjects: number;
      currentCount: number;
    }>
  | Readonly<{
      ok: false;
      code:
        "workspace_not_found" | "database_error" | "invalid_database_response";
    }>;

export type ScanExecutionQuotaResult =
  | Readonly<{
      ok: true;
      tier: PlanTier;
      remainingScansThisMonth: number;
    }>
  | Readonly<{
      ok: false;
      code: "invalid_workspace_id" | "invalid_query_count";
    }>
  | Readonly<{
      ok: false;
      code:
        | "monthly_scan_quota_exhausted"
        | "concurrency_exhausted"
        | "query_limit_exceeded";
      limit: number;
    }>
  | Readonly<{
      ok: false;
      code:
        "workspace_not_found" | "database_error" | "invalid_database_response";
    }>;

export type WorkspaceQuotaSummaryResult =
  | Readonly<{
      ok: true;
      summary: UsageQuotaSummary;
    }>
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "workspace_not_found"
        | "database_error"
        | "invalid_database_response";
    }>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

/**
 * Validates whether the workspace is permitted to create another project under its current plan.
 */
export async function verifyProjectCreationQuota(
  request: Readonly<{ workspaceId: unknown }>,
  gateway: WorkspacePlanGateway,
): Promise<ProjectCreationQuotaResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) {
    return Object.freeze({ ok: false, code: "invalid_workspace_id" });
  }

  const gatewayResult = await gateway(workspaceId);
  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const decision = checkProjectCreationEntitlement(
    gatewayResult.usage.tier,
    gatewayResult.usage.projectCount,
  );

  if (!decision.allowed) {
    return Object.freeze({
      ok: false,
      code: "project_limit_reached",
      maxProjects: decision.maxProjects,
      currentCount: decision.currentCount,
    });
  }

  return Object.freeze({
    ok: true,
    tier: gatewayResult.usage.tier,
    remainingProjects: decision.remainingProjects,
  });
}

/**
 * Validates whether the workspace is permitted to execute a scan with the given query count.
 */
export async function verifyScanExecutionQuota(
  request: Readonly<{
    workspaceId: unknown;
    requestedQueries: unknown;
  }>,
  gateway: WorkspacePlanGateway,
): Promise<ScanExecutionQuotaResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) {
    return Object.freeze({ ok: false, code: "invalid_workspace_id" });
  }

  if (
    typeof request.requestedQueries !== "number" ||
    !Number.isInteger(request.requestedQueries) ||
    request.requestedQueries < 1 ||
    request.requestedQueries > 10
  ) {
    return Object.freeze({ ok: false, code: "invalid_query_count" });
  }

  const gatewayResult = await gateway(workspaceId);
  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const decision = checkScanExecutionEntitlement(gatewayResult.usage.tier, {
    monthScans: gatewayResult.usage.monthScans,
    activeScans: gatewayResult.usage.activeScans,
    requestedQueries: request.requestedQueries,
  });

  if (!decision.allowed) {
    return Object.freeze({
      ok: false,
      code: decision.reason,
      limit: decision.limit,
    });
  }

  return Object.freeze({
    ok: true,
    tier: gatewayResult.usage.tier,
    remainingScansThisMonth: decision.remainingScansThisMonth,
  });
}

/**
 * Retrieves the complete quota summary for presentation on the workspace dashboard.
 */
export async function getWorkspaceQuotaSummary(
  request: Readonly<{ workspaceId: unknown }>,
  gateway: WorkspacePlanGateway,
): Promise<WorkspaceQuotaSummaryResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) {
    return Object.freeze({ ok: false, code: "invalid_workspace_id" });
  }

  const gatewayResult = await gateway(workspaceId);
  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const summary = calculateUsageQuota(gatewayResult.usage.tier, {
    projectCount: gatewayResult.usage.projectCount,
    monthScans: gatewayResult.usage.monthScans,
    activeScans: gatewayResult.usage.activeScans,
  });

  return Object.freeze({
    ok: true,
    summary,
  });
}
