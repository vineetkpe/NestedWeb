import "server-only";

import {
  validSettledMicrounits,
  type ScanCompletionGatewayResult,
  type ScanCompletionSummary,
  type ValidatedScanCompletionRequest,
} from "../application/scan-completion.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SupabaseCompleteScanWorkRpc = (
  args: Readonly<{
    p_workspace_id: string;
    p_scan_id: string;
    p_attempt_id: string;
    p_worker_id: string;
    p_lease_token: string;
  }>,
) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapDatabaseError(
  error: Record<string, unknown>,
): Exclude<ScanCompletionGatewayResult, { ok: true }> {
  if (error.code === "P0001" && error.message === "Scan lease not found")
    return { ok: false, code: "lease_not_found" };
  if (error.code === "P0001" && error.message === "Scan lease expired")
    return { ok: false, code: "lease_expired" };
  if (error.code === "P0001" && error.message === "Scan evidence incomplete")
    return { ok: false, code: "evidence_incomplete" };
  if (error.code === "P0001" && error.message === "Provider metering unavailable")
    return { ok: false, code: "metering_unavailable" };
  if (
    error.code === "22023" &&
    [
      "Invalid Gemini usage metadata",
      "Invalid Gemini search usage metadata",
      "Metered observation identity mismatch",
    ].includes(String(error.message))
  )
    return { ok: false, code: "invalid_metering" };
  if (
    error.code === "22023" &&
    [
      "Metered cost exceeds reserved worst case",
      "Metered cost exceeds reservation",
    ].includes(String(error.message))
  )
    return { ok: false, code: "cost_exceeded" };
  return { ok: false, code: "database_error" };
}

function parseCompletion(value: unknown): ScanCompletionSummary | null {
  if (
    !record(value) ||
    typeof value.workspaceId !== "string" ||
    !UUID_PATTERN.test(value.workspaceId) ||
    typeof value.scanId !== "string" ||
    !UUID_PATTERN.test(value.scanId) ||
    typeof value.attemptId !== "string" ||
    !UUID_PATTERN.test(value.attemptId) ||
    (value.state !== "completed" && value.state !== "partial") ||
    (value.reservationStatus !== "settled" &&
      value.reservationStatus !== "released") ||
    !validSettledMicrounits(value.settledMicrounits) ||
    value.costBasis !== "gross_list_price" ||
    typeof value.replayed !== "boolean"
  )
    return null;
  if (
    (value.reservationStatus === "released") !==
    (value.settledMicrounits === "0")
  )
    return null;

  return Object.freeze({
    workspaceId: value.workspaceId.toLowerCase(),
    scanId: value.scanId.toLowerCase(),
    attemptId: value.attemptId.toLowerCase(),
    state: value.state,
    reservationStatus: value.reservationStatus,
    settledMicrounits: value.settledMicrounits,
    costBasis: "gross_list_price",
    replayed: value.replayed,
  });
}

export async function executeSupabaseScanCompletion(
  request: ValidatedScanCompletionRequest,
  rpc: SupabaseCompleteScanWorkRpc,
): Promise<ScanCompletionGatewayResult> {
  let response: unknown;
  try {
    response = await rpc({
      p_workspace_id: request.workspaceId,
      p_scan_id: request.scanId,
      p_attempt_id: request.attemptId,
      p_worker_id: request.workerId,
      p_lease_token: request.leaseToken,
    });
  } catch {
    return { ok: false, code: "database_error" };
  }

  if (
    !record(response) ||
    !Object.hasOwn(response, "data") ||
    !Object.hasOwn(response, "error")
  )
    return { ok: false, code: "invalid_database_response" };

  if (response.error !== null && response.error !== undefined) {
    if (!record(response.error)) return { ok: false, code: "database_error" };
    return mapDatabaseError(response.error);
  }

  const completion = parseCompletion(response.data);
  if (
    completion === null ||
    completion.workspaceId !== request.workspaceId ||
    completion.scanId !== request.scanId ||
    completion.attemptId !== request.attemptId
  )
    return { ok: false, code: "invalid_database_response" };

  return { ok: true, completion };
}
