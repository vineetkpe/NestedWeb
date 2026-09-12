import "server-only";

import type {
  CreateProjectGatewayResult,
  ListProjectsGatewayResult,
  ProjectSummary,
  ValidatedCreateProjectRequest,
  ValidatedListProjectsRequest,
} from "../application/projects.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export type SupabaseProjectCreateRpc = (
  args: Readonly<{
    p_workspace_id: string;
    p_project_name: string;
    p_tracked_domain: string;
    p_idempotency_key: string;
  }>,
) => Promise<unknown>;

export type SupabaseProjectListQuery = (
  workspaceId: string,
) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validProjectName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.isWellFormed() &&
    value === value.trim() &&
    [...value].length >= 1 &&
    [...value].length <= 120
  );
}

function validTrackedDomain(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 253 &&
    DOMAIN_PATTERN.test(value)
  );
}

function parseProjectRow(
  value: unknown,
  workspaceId: string,
): ProjectSummary | null {
  if (!record(value)) return null;
  if (!validUuid(value.id)) return null;
  if (value.workspace_id !== workspaceId) return null;
  if (!validProjectName(value.name)) return null;
  if (!validTrackedDomain(value.tracked_domain)) return null;

  return Object.freeze({
    projectId: value.id.toLowerCase(),
    workspaceId,
    name: value.name,
    trackedDomain: value.tracked_domain,
  });
}

export async function executeSupabaseProjectCreate(
  request: ValidatedCreateProjectRequest,
  rpc: SupabaseProjectCreateRpc,
): Promise<CreateProjectGatewayResult> {
  let response: unknown;
  try {
    response = await rpc({
      p_workspace_id: request.workspaceId,
      p_project_name: request.name,
      p_tracked_domain: request.trackedDomain,
      p_idempotency_key: request.idempotencyKey,
    });
  } catch {
    return { ok: false, code: "database_error" };
  }

  if (!record(response))
    return { ok: false, code: "invalid_database_response" };

  const error = response.error;
  if (error !== null && error !== undefined) {
    if (record(error)) {
      if (
        error.code === "22023" &&
        error.message === "Idempotency key reused with different project payload"
      ) {
        return { ok: false, code: "idempotency_conflict" };
      }
      if (
        error.code === "22023" &&
        error.message === "Tracked domain already exists in workspace"
      ) {
        return { ok: false, code: "project_already_exists" };
      }
      if (error.code === "42501")
        return { ok: false, code: "authorization_denied" };
    }
    return { ok: false, code: "database_error" };
  }

  if (!validUuid(response.data))
    return { ok: false, code: "invalid_database_response" };

  return { ok: true, projectId: response.data.toLowerCase() };
}

export async function executeSupabaseProjectList(
  request: ValidatedListProjectsRequest,
  query: SupabaseProjectListQuery,
): Promise<ListProjectsGatewayResult> {
  let response: unknown;
  try {
    response = await query(request.workspaceId);
  } catch {
    return { ok: false, code: "database_error" };
  }

  if (!record(response))
    return { ok: false, code: "invalid_database_response" };

  const error = response.error;
  if (error !== null && error !== undefined) {
    if (record(error) && error.code === "42501")
      return { ok: false, code: "authorization_denied" };
    return { ok: false, code: "database_error" };
  }

  if (!Array.isArray(response.data))
    return { ok: false, code: "invalid_database_response" };

  const projects: ProjectSummary[] = [];
  const projectIds = new Set<string>();
  for (const row of response.data) {
    const project = parseProjectRow(row, request.workspaceId);
    if (project === null || projectIds.has(project.projectId))
      return { ok: false, code: "invalid_database_response" };
    projectIds.add(project.projectId);
    projects.push(project);
  }

  return { ok: true, projects: Object.freeze(projects) };
}
