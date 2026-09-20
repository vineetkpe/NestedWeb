const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceBootstrapRequest = Readonly<{
  workspaceName: unknown;
  idempotencyKey: unknown;
}>;

export type ValidatedWorkspaceBootstrapRequest = Readonly<{
  workspaceName: string;
  idempotencyKey: string;
}>;

export type WorkspaceBootstrapGatewayFailureCode =
  | "idempotency_conflict"
  | "authorization_denied"
  | "database_error"
  | "invalid_database_response";

export type WorkspaceBootstrapGatewayResult =
  | Readonly<{ ok: true; workspaceId: string }>
  | Readonly<{ ok: false; code: WorkspaceBootstrapGatewayFailureCode }>;

export type WorkspaceBootstrapResult =
  | WorkspaceBootstrapGatewayResult
  | Readonly<{
      ok: false;
      code: "invalid_workspace_name" | "invalid_idempotency_key";
    }>;

export type WorkspaceBootstrapGateway = (
  request: ValidatedWorkspaceBootstrapRequest,
) => Promise<WorkspaceBootstrapGatewayResult>;

function validWorkspaceName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.isWellFormed() &&
    value === value.trim() &&
    [...value].length >= 1 &&
    [...value].length <= 120
  );
}

function normalizeIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

/**
 * Validate replay-safe workspace creation input before crossing the database
 * boundary. Authentication is enforced by the request-scoped server adapter;
 * caller-controlled identity is intentionally absent from this contract.
 */
export async function bootstrapWorkspace(
  request: WorkspaceBootstrapRequest,
  gateway: WorkspaceBootstrapGateway,
): Promise<WorkspaceBootstrapResult> {
  if (!validWorkspaceName(request.workspaceName))
    return { ok: false, code: "invalid_workspace_name" };

  const idempotencyKey = normalizeIdempotencyKey(request.idempotencyKey);
  if (idempotencyKey === null)
    return { ok: false, code: "invalid_idempotency_key" };

  return gateway(
    Object.freeze({
      workspaceName: request.workspaceName,
      idempotencyKey,
    }),
  );
}
