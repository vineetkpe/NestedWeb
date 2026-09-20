import "server-only";

import type {
  ValidatedWorkspaceAuthorizationRequest,
  WorkspaceAuthorizationGatewayResult,
  WorkspaceRole,
} from "../application/workspace-authorization.ts";

export type SupabaseWorkspaceMembershipQuery = (
  workspaceId: string,
) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validRole(value: unknown): value is WorkspaceRole {
  return value === "owner" || value === "member";
}

export async function executeSupabaseWorkspaceAuthorization(
  request: ValidatedWorkspaceAuthorizationRequest,
  queryMembership: SupabaseWorkspaceMembershipQuery,
): Promise<WorkspaceAuthorizationGatewayResult> {
  let response: unknown;
  try {
    response = await queryMembership(request.workspaceId);
  } catch {
    return { ok: false, code: "database_error" };
  }

  if (!record(response))
    return { ok: false, code: "invalid_database_response" };

  if (response.error !== null && response.error !== undefined)
    return { ok: false, code: "database_error" };

  if (response.data === null) return { ok: false, code: "not_member" };
  if (!record(response.data))
    return { ok: false, code: "invalid_database_response" };

  const workspaceId = response.data.workspace_id;
  const role = response.data.role;
  if (workspaceId !== request.workspaceId || !validRole(role))
    return { ok: false, code: "invalid_database_response" };

  return {
    ok: true,
    membership: Object.freeze({ workspaceId, role }),
  };
}
