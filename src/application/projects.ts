import {
  normalizeWebsite,
  type WebsiteErrorCode,
} from "../domain/website.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProjectSummary = Readonly<{
  projectId: string;
  workspaceId: string;
  name: string;
  trackedDomain: string;
}>;

export type CreateProjectRequest = Readonly<{
  workspaceId: unknown;
  name: unknown;
  website: unknown;
  idempotencyKey: unknown;
}>;

export type ValidatedCreateProjectRequest = Readonly<{
  workspaceId: string;
  name: string;
  trackedDomain: string;
  idempotencyKey: string;
}>;

export type ListProjectsRequest = Readonly<{
  workspaceId: unknown;
}>;

export type ValidatedListProjectsRequest = Readonly<{
  workspaceId: string;
}>;

export type ProjectGatewayFailureCode =
  | "not_member"
  | "idempotency_conflict"
  | "project_already_exists"
  | "authorization_denied"
  | "database_error"
  | "invalid_database_response";

export type CreateProjectGatewayResult =
  | Readonly<{ ok: true; projectId: string }>
  | Readonly<{ ok: false; code: ProjectGatewayFailureCode }>;

export type ListProjectsGatewayResult =
  | Readonly<{ ok: true; projects: readonly ProjectSummary[] }>
  | Readonly<{
      ok: false;
      code:
        | "not_member"
        | "authorization_denied"
        | "database_error"
        | "invalid_database_response";
    }>;

export type CreateProjectResult =
  | CreateProjectGatewayResult
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "invalid_project_name"
        | "invalid_idempotency_key";
    }>
  | Readonly<{
      ok: false;
      code: "invalid_website";
      reason: WebsiteErrorCode;
    }>;

export type ListProjectsResult =
  | ListProjectsGatewayResult
  | Readonly<{ ok: false; code: "invalid_workspace_id" }>;

export type CreateProjectGateway = (
  request: ValidatedCreateProjectRequest,
) => Promise<CreateProjectGatewayResult>;

export type ListProjectsGateway = (
  request: ValidatedListProjectsRequest,
) => Promise<ListProjectsGatewayResult>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
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

export async function createProject(
  request: CreateProjectRequest,
  gateway: CreateProjectGateway,
): Promise<CreateProjectResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null)
    return { ok: false, code: "invalid_workspace_id" };

  if (!validProjectName(request.name))
    return { ok: false, code: "invalid_project_name" };

  const website = normalizeWebsite(request.website);
  if (!website.ok)
    return { ok: false, code: "invalid_website", reason: website.code };

  const idempotencyKey = normalizeUuid(request.idempotencyKey);
  if (idempotencyKey === null)
    return { ok: false, code: "invalid_idempotency_key" };

  return gateway(
    Object.freeze({
      workspaceId,
      name: request.name,
      trackedDomain: website.value.hostname,
      idempotencyKey,
    }),
  );
}

export async function listProjects(
  request: ListProjectsRequest,
  gateway: ListProjectsGateway,
): Promise<ListProjectsResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null)
    return { ok: false, code: "invalid_workspace_id" };

  return gateway(Object.freeze({ workspaceId }));
}
