import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  persistProfilePromptCohortReserveClaimScan,
  type PersistProfilePromptCohortReserveClaimScanRequest,
  type PersistProfilePromptCohortReserveClaimScanResult,
} from "../../application/profile-prompt-cohort-scan-claim.ts";
import {
  AuthBoundaryError,
  type AuthBoundaryFailureCode,
  requireSupabaseIdentity,
} from "../supabase-auth.ts";
import { executeSupabaseCompanyProfilePersistence } from "../supabase-company-profile-persistence.ts";
import { executeSupabasePromptCohortPersistence } from "../supabase-prompt-cohort-persistence.ts";
import { executeSupabaseScanReservation } from "../supabase-scan-reservation.ts";
import { executeSupabaseTargetedScanClaim } from "../supabase-targeted-scan-claim.ts";
import {
  requireSupabasePublicConfig,
  SupabaseConfigurationError,
} from "./config.ts";
import { createSupabaseServerClient } from "./server.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_KEY_PATTERN = /^sb_secret_[A-Za-z0-9._-]{10,500}$/;

export type SupabaseScanClaimActorRpcName = "reserve_scan_from_cohort";
export type SupabaseScanClaimServiceRpcName =
  | "persist_company_profile_snapshot"
  | "persist_prompt_cohort"
  | "claim_scan_work_for_scan";

export type SupabaseScanClaimActorRpc = (
  name: SupabaseScanClaimActorRpcName,
  args: unknown,
) => Promise<unknown>;

export type SupabaseScanClaimServiceRpc = (
  name: SupabaseScanClaimServiceRpcName,
  args: unknown,
) => Promise<unknown>;

type ServerEnvironment = Readonly<Record<string, unknown>>;

type ScanClaimServerSetupFailure = Readonly<{
  ok: false;
  stage: "server_setup";
  code:
    | "missing_supabase_secret_key"
    | "invalid_supabase_secret_key"
    | "invalid_public_supabase_config";
}>;

type ScanClaimAuthorizationFailure = Readonly<{
  ok: false;
  stage: "authorization";
  code:
    | AuthBoundaryFailureCode
    | "invalid_workspace_id"
    | "invalid_project_id"
    | "workspace_access_denied"
    | "project_access_denied"
    | "authorization_database_error";
}>;

export type ClaimCurrentUserReservedScanResult =
  | PersistProfilePromptCohortReserveClaimScanResult
  | ScanClaimServerSetupFailure
  | ScanClaimAuthorizationFailure;

type ScanClaimServerConfig = Readonly<{
  supabaseUrl: string;
  supabaseSecretKey: string;
}>;

function setupFailure(
  code: ScanClaimServerSetupFailure["code"],
): ScanClaimServerSetupFailure {
  return { ok: false, stage: "server_setup", code };
}

function authorizationFailure(
  code: ScanClaimAuthorizationFailure["code"],
): ScanClaimAuthorizationFailure {
  return { ok: false, stage: "authorization", code };
}

function envString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readServerConfig(
  env: ServerEnvironment,
): ScanClaimServerConfig | ScanClaimServerSetupFailure {
  const secret = envString(env.SUPABASE_SECRET_KEY);
  if (secret === undefined || secret === "")
    return setupFailure("missing_supabase_secret_key");
  if (secret !== secret.trim() || !SECRET_KEY_PATTERN.test(secret))
    return setupFailure("invalid_supabase_secret_key");

  try {
    const publicConfig = requireSupabasePublicConfig({
      url: envString(env.NEXT_PUBLIC_SUPABASE_URL),
      publishableKey: envString(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    });
    return Object.freeze({
      supabaseUrl: publicConfig.url,
      supabaseSecretKey: secret,
    });
  } catch (error) {
    if (error instanceof SupabaseConfigurationError)
      return setupFailure("invalid_public_supabase_config");
    throw error;
  }
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  return UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

/**
 * Testable Supabase composition for C8e. Service-only provenance writes and the
 * exact claim use the service channel; reservation deliberately stays on the
 * authenticated actor channel so Postgres re-checks membership/budget there.
 */
export async function executeSupabaseReservedScanClaim(
  request: PersistProfilePromptCohortReserveClaimScanRequest,
  actorRpc: SupabaseScanClaimActorRpc,
  serviceRpc: SupabaseScanClaimServiceRpc,
): Promise<PersistProfilePromptCohortReserveClaimScanResult> {
  return persistProfilePromptCohortReserveClaimScan(
    request,
    (validated) =>
      executeSupabaseCompanyProfilePersistence(validated, (args) =>
        serviceRpc("persist_company_profile_snapshot", args),
      ),
    (validated) =>
      executeSupabasePromptCohortPersistence(validated, (args) =>
        serviceRpc("persist_prompt_cohort", args),
      ),
    (validated) =>
      executeSupabaseScanReservation(validated, (args) =>
        actorRpc("reserve_scan_from_cohort", args),
      ),
    (validated) =>
      executeSupabaseTargetedScanClaim(validated, (args) =>
        serviceRpc("claim_scan_work_for_scan", args),
      ),
  );
}

/**
 * Request-scoped C8 server entry point. The current user's verified session and
 * RLS-visible workspace/project are checked before any service-role write. The
 * secret client has no persisted auth session and this path never creates a
 * Gemini provider or executes a paid request.
 */
export async function claimCurrentUserReservedScan(
  request: PersistProfilePromptCohortReserveClaimScanRequest,
  options: Readonly<{ env?: ServerEnvironment }> = {},
): Promise<ClaimCurrentUserReservedScanResult> {
  const env = options.env ?? process.env;
  const config = readServerConfig(env);
  if ("stage" in config) return config;

  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) return authorizationFailure("invalid_workspace_id");
  const projectId = normalizeUuid(request.projectId);
  if (projectId === null) return authorizationFailure("invalid_project_id");

  const actorClient = await createSupabaseServerClient();
  try {
    await requireSupabaseIdentity(actorClient);
  } catch (error) {
    if (error instanceof AuthBoundaryError)
      return authorizationFailure(error.code);
    return authorizationFailure("auth_verification_failed");
  }

  const membership = await actorClient
    .from("workspace_memberships")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (membership.error !== null)
    return authorizationFailure("authorization_database_error");
  if (membership.data === null)
    return authorizationFailure("workspace_access_denied");

  const project = await actorClient
    .from("projects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", projectId)
    .maybeSingle();
  if (project.error !== null)
    return authorizationFailure("authorization_database_error");
  if (project.data === null) return authorizationFailure("project_access_denied");

  const serviceClient = createClient(
    config.supabaseUrl,
    config.supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  return executeSupabaseReservedScanClaim(
    request,
    async (name, args) =>
      await actorClient.rpc(name, args as Record<string, unknown>),
    async (name, args) =>
      await serviceClient.rpc(name, args as Record<string, unknown>),
  );
}
