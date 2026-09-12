import "server-only";

import {
  bootstrapWorkspace,
  type WorkspaceBootstrapRequest,
  type WorkspaceBootstrapResult,
} from "../../application/workspace-bootstrap.ts";
import { requireSupabaseIdentity } from "../supabase-auth.ts";
import { executeSupabaseWorkspaceBootstrap } from "../supabase-workspace-bootstrap.ts";
import { createSupabaseServerClient } from "./server.ts";

/**
 * Request-scoped workspace bootstrap for Server Actions and Route Handlers.
 *
 * The same Supabase client first verifies the signed-in actor and then executes
 * the RPC. The RPC receives no user ID; Postgres derives the actor from
 * auth.uid() and owns transaction/idempotency semantics.
 */
export async function bootstrapCurrentUserWorkspace(
  request: WorkspaceBootstrapRequest,
): Promise<WorkspaceBootstrapResult> {
  const client = await createSupabaseServerClient();
  await requireSupabaseIdentity(client);

  return bootstrapWorkspace(request, (validatedRequest) =>
    executeSupabaseWorkspaceBootstrap(validatedRequest, (args) =>
      client.rpc("create_workspace", args),
    ),
  );
}
