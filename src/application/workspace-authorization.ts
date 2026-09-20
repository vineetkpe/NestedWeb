const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceRole = "owner" | "member";

export type WorkspaceMembership = Readonly<{
  workspaceId: string;
  role: WorkspaceRole;
}>;

export type WorkspaceAuthorizationRequest = Readonly<{
  workspaceId: unknown;
}>;

export type ValidatedWorkspaceAuthorizationRequest = Readonly<{
  workspaceId: string;
}>;

export type WorkspaceAuthorizationGatewayResult =
  | Readonly<{ ok: true; membership: WorkspaceMembership }>
  | Readonly<{
      ok: false;
      code: "not_member" | "database_error" | "invalid_database_response";
    }>;

export type WorkspaceAuthorizationResult =
  | WorkspaceAuthorizationGatewayResult
  | Readonly<{ ok: false; code: "invalid_workspace_id" }>;

export type WorkspaceAuthorizationGateway = (
  request: ValidatedWorkspaceAuthorizationRequest,
) => Promise<WorkspaceAuthorizationGatewayResult>;

function normalizeWorkspaceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

/**
 * Authorize against a fresh membership lookup. Caller-controlled user IDs and
 * roles are intentionally absent; the server adapter binds the lookup to the
 * verified Supabase session and database RLS.
 */
export async function authorizeWorkspaceMembership(
  request: WorkspaceAuthorizationRequest,
  gateway: WorkspaceAuthorizationGateway,
): Promise<WorkspaceAuthorizationResult> {
  const workspaceId = normalizeWorkspaceId(request.workspaceId);
  if (workspaceId === null) return { ok: false, code: "invalid_workspace_id" };

  return gateway(Object.freeze({ workspaceId }));
}
