import {
  compareHistoricalScans,
  validateScanCompatibility,
  type ScanComparisonInput,
  type ScanComparisonReport,
} from "../domain/scan-comparison.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ScanHistorySummary = Readonly<{
  scanId: string;
  projectId: string;
  workspaceId: string;
  trackedDomain: string;
  completedAt: string;
  observationCount: number;
  mentionRate: number | null;
  recommendationRate: number | null;
}>;

export type ScanHistoryGateway = Readonly<{
  listProjectScans(
    projectId: string,
  ): Promise<ReadonlyArray<ScanHistorySummary>>;
  getScanComparisonInput(scanId: string): Promise<ScanComparisonInput | null>;
}>;

export type CompareScansRequest = Readonly<{
  workspaceId: string;
  projectId: string;
  baselineScanId: string;
  targetScanId: string;
}>;

export type CompareScansFailureCode =
  | "invalid_request"
  | "scan_not_found"
  | "cross_tenant_denied"
  | "incompatible_scans"
  | "gateway_error";

export type CompareScansResult =
  | Readonly<{ ok: true; report: ScanComparisonReport }>
  | Readonly<{ ok: false; code: CompareScansFailureCode; message: string }>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed !== value ||
    !UUID_PATTERN.test(trimmed)
  ) {
    return null;
  }
  return trimmed.toLowerCase();
}

/**
 * Application orchestrator for comparing two historical scans for a client project.
 * Enforces tenant isolation, input validation, and fail-closed error handling.
 */
export async function compareProjectScans(
  request: CompareScansRequest,
  gateway: ScanHistoryGateway,
): Promise<CompareScansResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  const projectId = normalizeUuid(request.projectId);
  const baselineScanId = normalizeUuid(request.baselineScanId);
  const targetScanId = normalizeUuid(request.targetScanId);

  if (
    workspaceId === null ||
    projectId === null ||
    baselineScanId === null ||
    targetScanId === null
  ) {
    return Object.freeze({
      ok: false,
      code: "invalid_request",
      message: "Valid workspace, project, and scan UUIDs are required.",
    });
  }

  if (baselineScanId === targetScanId) {
    return Object.freeze({
      ok: false,
      code: "incompatible_scans",
      message: "Baseline and target scan must be distinct.",
    });
  }

  let baselineInput: ScanComparisonInput | null;
  let targetInput: ScanComparisonInput | null;

  try {
    [baselineInput, targetInput] = await Promise.all([
      gateway.getScanComparisonInput(baselineScanId),
      gateway.getScanComparisonInput(targetScanId),
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal gateway error";
    return Object.freeze({
      ok: false,
      code: "gateway_error",
      message: `Failed to retrieve scan data: ${msg}`,
    });
  }

  if (baselineInput === null) {
    return Object.freeze({
      ok: false,
      code: "scan_not_found",
      message: `Baseline scan ${baselineScanId} was not found.`,
    });
  }

  if (targetInput === null) {
    return Object.freeze({
      ok: false,
      code: "scan_not_found",
      message: `Target scan ${targetScanId} was not found.`,
    });
  }

  // Cross-tenant verification
  if (
    baselineInput.workspaceId !== workspaceId ||
    targetInput.workspaceId !== workspaceId
  ) {
    return Object.freeze({
      ok: false,
      code: "cross_tenant_denied",
      message: "Access to scans outside the current workspace is denied.",
    });
  }

  // Cross-project verification
  if (
    baselineInput.projectId !== projectId ||
    targetInput.projectId !== projectId
  ) {
    return Object.freeze({
      ok: false,
      code: "incompatible_scans",
      message: "Both scans must belong to the requested project.",
    });
  }

  const compatibility = validateScanCompatibility(
    {
      scanId: baselineInput.scanId,
      workspaceId: baselineInput.workspaceId,
      projectId: baselineInput.projectId,
      trackedDomain: baselineInput.trackedDomain,
      metricsVersion: baselineInput.metrics.methodVersion,
    },
    {
      scanId: targetInput.scanId,
      workspaceId: targetInput.workspaceId,
      projectId: targetInput.projectId,
      trackedDomain: targetInput.trackedDomain,
      metricsVersion: targetInput.metrics.methodVersion,
    },
  );

  if (!compatibility.ok) {
    return Object.freeze({
      ok: false,
      code: "incompatible_scans",
      message: compatibility.message,
    });
  }

  try {
    const report = compareHistoricalScans(baselineInput, targetInput);
    return Object.freeze({ ok: true, report });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Comparison failure";
    return Object.freeze({
      ok: false,
      code: "incompatible_scans",
      message: msg,
    });
  }
}
