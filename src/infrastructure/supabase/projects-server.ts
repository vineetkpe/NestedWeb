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
import {
  AuthBoundaryError,
  requireSupabaseIdentity,
  type SupabaseClaimsVerifier,
} from "../supabase-auth.ts";
import {
  executeSupabaseProjectCreate,
  executeSupabaseProjectList,
  type SupabaseProjectCreateRpc,
  type SupabaseProjectListQuery,
} from "../supabase-projects.ts";
import { executeSupabaseWorkspaceAuthorization } from "../supabase-workspace-authorization.ts";
import { createSupabaseServerClient } from "./server.ts";

export type VerifiedProjectCreateDependencies = Readonly<{
  verifier: SupabaseClaimsVerifier;
  membershipQuery: (workspaceId: string) => Promise<unknown>;
  projectCreateRpc: SupabaseProjectCreateRpc;
}>;

export type VerifiedProjectListDependencies = Readonly<{
  verifier: SupabaseClaimsVerifier;
  membershipQuery: (workspaceId: string) => Promise<unknown>;
  projectListQuery: SupabaseProjectListQuery;
}>;

export async function executeVerifiedCurrentUserProjectCreate(
  request: CreateProjectRequest,
  dependencies: VerifiedProjectCreateDependencies,
): Promise<CreateProjectResult> {
  try {
    await requireSupabaseIdentity(dependencies.verifier);
  } catch (error) {
    if (error instanceof AuthBoundaryError) {
      return { ok: false, code: "authorization_denied" };
    }
    return { ok: false, code: "authorization_denied" };
  }

  return createProject(request, async (validatedRequest) => {
    const authorization = await authorizeWorkspaceMembership(
      { workspaceId: validatedRequest.workspaceId },
      (workspaceRequest) =>
        executeSupabaseWorkspaceAuthorization(
          workspaceRequest,
          dependencies.membershipQuery,
        ),
    );
    if (!authorization.ok) {
      if (authorization.code === "invalid_workspace_id")
        return { ok: false, code: "invalid_database_response" };
      return authorization;
    }

    return executeSupabaseProjectCreate(
      validatedRequest,
      dependencies.projectCreateRpc,
    );
  });
}

export async function executeVerifiedCurrentUserProjectList(
  request: ListProjectsRequest,
  dependencies: VerifiedProjectListDependencies,
): Promise<ListProjectsResult> {
  try {
    await requireSupabaseIdentity(dependencies.verifier);
  } catch (error) {
    if (error instanceof AuthBoundaryError) {
      return { ok: false, code: "authorization_denied" };
    }
    return { ok: false, code: "authorization_denied" };
  }

  return listProjects(request, async (validatedRequest) => {
    const authorization = await authorizeWorkspaceMembership(
      { workspaceId: validatedRequest.workspaceId },
      (workspaceRequest) =>
        executeSupabaseWorkspaceAuthorization(
          workspaceRequest,
          dependencies.membershipQuery,
        ),
    );
    if (!authorization.ok) {
      if (authorization.code === "invalid_workspace_id")
        return { ok: false, code: "invalid_database_response" };
      return authorization;
    }

    return executeSupabaseProjectList(
      validatedRequest,
      dependencies.projectListQuery,
    );
  });
}

export async function createCurrentUserProject(
  request: CreateProjectRequest,
): Promise<CreateProjectResult> {
  const client = await createSupabaseServerClient();
  return executeVerifiedCurrentUserProjectCreate(request, {
    verifier: client,
    membershipQuery: async (workspaceId) =>
      client
        .from("workspace_memberships")
        .select("workspace_id,role")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    projectCreateRpc: async (args) => client.rpc("create_project", args),
  });
}

export async function listCurrentUserProjects(
  request: ListProjectsRequest,
): Promise<ListProjectsResult> {
  const client = await createSupabaseServerClient();
  return executeVerifiedCurrentUserProjectList(request, {
    verifier: client,
    membershipQuery: async (workspaceId) =>
      client
        .from("workspace_memberships")
        .select("workspace_id,role")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    projectListQuery: async (workspaceId) =>
      client
        .from("projects")
        .select("id,workspace_id,name,tracked_domain")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
  });
}
