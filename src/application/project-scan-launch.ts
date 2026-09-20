const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProjectScanLaunchRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  workerId: unknown;
  leaseSeconds: unknown;
}>;

export type ValidatedProjectScanLaunchRequest = Readonly<{
  workspaceId: string;
  projectId: string;
  workerId: string;
  leaseSeconds: number;
  profileIdempotencyKey: string;
  promptCohortIdempotencyKey: string;
  reservationIdempotencyKey: string;
  capturedAt: string;
}>;

export type ProjectScanLaunchResult =
  | Readonly<{ ok: true; value: ValidatedProjectScanLaunchRequest }>
  | Readonly<{ ok: false; code: "invalid_project_scan_request" }>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function validLeaseSeconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 30 &&
    value <= 300
  );
}

export function buildProjectScanLaunchRequest(
  request: ProjectScanLaunchRequest,
): ProjectScanLaunchResult {
  const workspaceId = normalizeUuid(request.workspaceId);
  const projectId = normalizeUuid(request.projectId);
  const workerId = normalizeUuid(request.workerId);

  if (
    workspaceId === null ||
    projectId === null ||
    workerId === null ||
    !validLeaseSeconds(request.leaseSeconds)
  ) {
    return { ok: false, code: "invalid_project_scan_request" };
  }

  const capturedAt = new Date().toISOString();

  return {
    ok: true,
    value: Object.freeze({
      workspaceId,
      projectId,
      workerId,
      leaseSeconds: request.leaseSeconds,
      profileIdempotencyKey: crypto.randomUUID(),
      promptCohortIdempotencyKey: crypto.randomUUID(),
      reservationIdempotencyKey: crypto.randomUUID(),
      capturedAt,
    }),
  };
}
