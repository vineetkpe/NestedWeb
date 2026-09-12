import "server-only";

import {
  createProject,
  listProjects,
  type CreateProjectRequest,
  type CreateProjectResult,
  type ListProjectsRequest,
  type ListProjectsResult,
} from "../../application/projects.ts";
import { authorizeWorkspaceMembership } from "../../application/workspace-authorization.ts";
import { requireSupabaseIdentity } from "../supabase-auth.ts";
import {
  executeSupabaseProjectCreate,
  executeSupabaseProjectList,
} from "../supabase-projects.ts";
import { executeSupabaseWorkspaceAuthorization } from "../supabase-workspace-authorization.ts";
import { createSupabaseServerClient } from "./server.ts";

export async function createCurrentUserProject(
  request: CreateProjectRequest,
): Promise<CreateProjectResult> {
  const client = await createSupabaseServerClient();
  await requireSupabaseIdentity(client);

  return createProject(request, async (validatedRequest) => {
    const authorization = await authorizeWorkspaceMembership(
      { workspaceId: validatedRequest.workspaceId },
      (workspaceRequest) =>
        executeSupabaseWorkspaceAuthorization(
          workspaceRequest,
          async (workspaceId) =>
            client
              .from("workspace_memberships")
              .select("workspace_id,role")
              .eq("workspace_id", workspaceId)
              .maybeSingle(),
        ),
    );
    if (!authorization.ok) {
      if (authorization.code === "invalid_workspace_id")
        return { ok: false, code: "invalid_database_response" };
      return authorization;
    }

    return executeSupabaseProjectCreate(validatedRequest, async (args) =>
      client.rpc("create_project", args),
    );
  });
}

export async function listCurrentUserProjects(
  request: ListProjectsRequest,
): Promise<ListProjectsResult> {
  const client = await createSupabaseServerClient();
  await requireSupabaseIdentity(client);

  return listProjects(request, async (validatedRequest) => {
    const authorization = await authorizeWorkspaceMembership(
      { workspaceId: validatedRequest.workspaceId },
      (workspaceRequest) =>
        executeSupabaseWorkspaceAuthorization(
          workspaceRequest,
          async (workspaceId) =>
            client
              .from("workspace_memberships")
              .select("workspace_id,role")
              .eq("workspace_id", workspaceId)
              .maybeSingle(),
        ),
    );
    if (!authorization.ok) {
      if (authorization.code === "invalid_workspace_id")
        return { ok: false, code: "invalid_database_response" };
      return authorization;
    }

    return executeSupabaseProjectList(validatedRequest, async (workspaceId) =>
      client
        .from("projects")
        .select("id,workspace_id,name,tracked_domain")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    );
  });
}
