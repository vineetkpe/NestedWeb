const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReserveScanRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  idempotencyKey: unknown;
  promptCohortId: unknown;
}>;

export type ValidatedReserveScanRequest = Readonly<{
  workspaceId: string;
  projectId: string;
  idempotencyKey: string;
  promptCohortId: string;
}>;

export type ScanReservationSummary = Readonly<{
  scanId: string;
  promptCohortId: string;
  reservationId: string;
  reservedMicrounits: string;
  currency: string;
  provider: "gemini";
  modelId: string;
  priceVersion: string;
  maxAttempts: number;
  maxOutputTokens: number;
  requestFingerprint: string;
  replayed: boolean;
}>;

export type ScanReservationGatewayFailureCode =
  | "authorization_denied"
  | "idempotency_conflict"
  | "execution_unavailable"
  | "empty_prompt_cohort"
  | "query_limit_exceeded"
  | "concurrency_exhausted"
  | "request_limit_exhausted"
  | "budget_exhausted"
  | "database_error"
  | "invalid_database_response";

export type ScanReservationGatewayResult =
  | Readonly<{ ok: true; reservation: ScanReservationSummary }>
  | Readonly<{ ok: false; code: ScanReservationGatewayFailureCode }>;

export type ReserveScanResult =
  | ScanReservationGatewayResult
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "invalid_project_id"
        | "invalid_idempotency_key"
        | "invalid_prompt_cohort_id";
    }>;

export type ScanReservationGateway = (
  request: ValidatedReserveScanRequest,
) => Promise<ScanReservationGatewayResult>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

/**
 * Reserves execution only for an already-durable prompt cohort. Prompt method,
 * profile method, ordered queries and evidence provenance are resolved by the
 * database from that cohort; callers cannot submit an alternate query payload.
 */
export async function reserveScan(
  request: ReserveScanRequest,
  gateway: ScanReservationGateway,
): Promise<ReserveScanResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) return { ok: false, code: "invalid_workspace_id" };

  const projectId = normalizeUuid(request.projectId);
  if (projectId === null) return { ok: false, code: "invalid_project_id" };

  const idempotencyKey = normalizeUuid(request.idempotencyKey);
  if (idempotencyKey === null)
    return { ok: false, code: "invalid_idempotency_key" };

  const promptCohortId = normalizeUuid(request.promptCohortId);
  if (promptCohortId === null)
    return { ok: false, code: "invalid_prompt_cohort_id" };

  return gateway(
    Object.freeze({
      workspaceId,
      projectId,
      idempotencyKey,
      promptCohortId,
    }),
  );
}
