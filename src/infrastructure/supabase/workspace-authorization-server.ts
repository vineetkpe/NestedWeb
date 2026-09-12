import "server-only";

import {
  authorizeWorkspaceMembership,
  type WorkspaceAuthorizationRequest,
  type WorkspaceAuthorizationResult,
} from "../../application/workspace-authorization.ts";
import { requireSupabaseIdentity } from "../supabase-auth.ts";
import { executeSupabaseWorkspaceAuthorization } from "../supabase-workspace-authorization.ts";
import { createSupabaseServerClient } from "./server.ts";

/**
 * Request-scoped authorization for workspace-protected server operations.
 * Membership is read from Postgres on every call, under the verified user's
 * RLS context, so revoked access takes effect without waiting for JWT refresh.
 */
export async function authorizeCurrentUserWorkspace(
  request: WorkspaceAuthorizationRequest,
): Promise<WorkspaceAuthorizationResult> {
  const client = await createSupabaseServerClient();
  await requireSupabaseIdentity(client);

  return authorizeWorkspaceMembership(request, (validatedRequest) =>
    executeSupabaseWorkspaceAuthorization(
      validatedRequest,
      async (workspaceId) =>
        client
          .from("workspace_memberships")
          .select("workspace_id,role")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
    ),
  );
}
