import "server-only";

import type {
  ValidatedWorkspaceBootstrapRequest,
  WorkspaceBootstrapGatewayResult,
} from "../application/workspace-bootstrap.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SupabaseWorkspaceBootstrapRpc = (
  args: Readonly<{
    p_workspace_name: string;
    p_idempotency_key: string;
  }>,
) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export async function executeSupabaseWorkspaceBootstrap(
  request: ValidatedWorkspaceBootstrapRequest,
  rpc: SupabaseWorkspaceBootstrapRpc,
): Promise<WorkspaceBootstrapGatewayResult> {
  let response: unknown;
  try {
    response = await rpc({
      p_workspace_name: request.workspaceName,
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
        error.message === "Idempotency key reused with different workspace name"
      ) {
        return { ok: false, code: "idempotency_conflict" };
      }
      if (error.code === "42501")
        return { ok: false, code: "authorization_denied" };
    }
    return { ok: false, code: "database_error" };
  }

  if (!validUuid(response.data))
    return { ok: false, code: "invalid_database_response" };

  return { ok: true, workspaceId: response.data.toLowerCase() };
}
