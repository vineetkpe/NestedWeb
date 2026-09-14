import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Crawler } from "../../application/crawler.ts";
import type { ClaimedLiveProviderFactory } from "../../application/claim-scan-execution.ts";
import type { WebsiteAddressResolver } from "../../application/website-target.ts";
import { createNativeEntryCrawler } from "../native-entry-crawler.ts";
import {
  executeSupabaseProjectBoundedScan,
  type ExecuteSupabaseProjectBoundedScanResult,
  type SupabaseAuthorizedProjectQuery,
  type SupabaseProjectBoundedScanRequest,
} from "../supabase-project-bounded-scan-runner.ts";
import type { SupabaseBoundedScanServiceRpc } from "../supabase-bounded-scan-runner.ts";
import {
  AuthBoundaryError,
  type AuthBoundaryFailureCode,
  requireSupabaseIdentity,
  type SupabaseClaimsVerifier,
} from "../supabase-auth.ts";
import { resolveWebsiteAddresses } from "../website-dns.ts";
import type { SupabaseScanClaimActorRpc } from "./reserved-scan-claim-runtime.ts";
import {
  requireSupabasePublicConfig,
  SupabaseConfigurationError,
} from "./config.ts";
import { createSupabaseServerClient } from "./server.ts";

const SECRET_KEY_PATTERN = /^sb_secret_[A-Za-z0-9._-]{10,500}$/;

type ServerEnvironment = Readonly<Record<string, unknown>>;

type ProjectBoundedScanServerSetupFailure = Readonly<{
  state: "not_executed";
  stage: "server_setup";
  failure: Readonly<{
    ok: false;
    code:
      | "missing_supabase_secret_key"
      | "invalid_supabase_secret_key"
      | "invalid_public_supabase_config";
  }>;
}>;

type ProjectBoundedScanAuthorizationFailure = Readonly<{
  state: "not_executed";
  stage: "authorization";
  failure: Readonly<{
    ok: false;
    code: AuthBoundaryFailureCode;
  }>;
}>;

export type RunCurrentUserProjectBoundedScanResult =
  | ExecuteSupabaseProjectBoundedScanResult
  | ProjectBoundedScanServerSetupFailure
  | ProjectBoundedScanAuthorizationFailure;

type ServerConfig = Readonly<{
  supabaseUrl: string;
  supabaseSecretKey: string;
}>;

export type VerifiedProjectBoundedScanDependencies = Readonly<{
  verifier: SupabaseClaimsVerifier;
  projectQuery: SupabaseAuthorizedProjectQuery;
  resolveAddresses: WebsiteAddressResolver;
  crawler: Crawler;
  actorRpc: SupabaseScanClaimActorRpc;
  serviceRpc: SupabaseBoundedScanServiceRpc;
  providerFactory: ClaimedLiveProviderFactory;
}>;

function setupFailure(
  code: ProjectBoundedScanServerSetupFailure["failure"]["code"],
): ProjectBoundedScanServerSetupFailure {
  return Object.freeze({
    state: "not_executed" as const,
    stage: "server_setup" as const,
    failure: Object.freeze({ ok: false as const, code }),
  });
}

function authorizationFailure(
  code: AuthBoundaryFailureCode,
): ProjectBoundedScanAuthorizationFailure {
  return Object.freeze({
    state: "not_executed" as const,
    stage: "authorization" as const,
    failure: Object.freeze({ ok: false as const, code }),
  });
}

function cancelled(): Extract<
  ExecuteSupabaseProjectBoundedScanResult,
  { stage: "cancelled" }
> {
  return Object.freeze({
    state: "not_executed" as const,
    stage: "cancelled" as const,
    failure: Object.freeze({ ok: false as const, code: "cancelled" as const }),
  });
}

function envString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readServerConfig(
  env: ServerEnvironment,
): ServerConfig | ProjectBoundedScanServerSetupFailure {
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

/**
 * Testable auth-first server composition. No DNS, crawl, database mutation or
 * provider factory is reached until Supabase has verified the actor's claims.
 */
export async function executeVerifiedProjectBoundedScan(
  request: SupabaseProjectBoundedScanRequest,
  dependencies: VerifiedProjectBoundedScanDependencies,
  signal?: AbortSignal,
): Promise<
  ExecuteSupabaseProjectBoundedScanResult | ProjectBoundedScanAuthorizationFailure
> {
  if (signal?.aborted) return cancelled();

  try {
    await requireSupabaseIdentity(dependencies.verifier);
  } catch (error) {
    if (error instanceof AuthBoundaryError)
      return authorizationFailure(error.code);
    return authorizationFailure("auth_verification_failed");
  }
  if (signal?.aborted) return cancelled();

  return executeSupabaseProjectBoundedScan(
    request,
    dependencies.projectQuery,
    dependencies.resolveAddresses,
    dependencies.crawler,
    dependencies.actorRpc,
    dependencies.serviceRpc,
    dependencies.providerFactory,
    signal,
  );
}

/**
 * Request-scoped C8 entry point. It uses the authenticated actor client for the
 * exact RLS project read and reservation RPCs, native bounded DNS/crawl adapters,
 * and a non-persisting service client for provenance/claim/execution RPCs.
 *
 * Provider construction is deliberately caller-injected. This function reads no
 * Gemini credential, exposes no route/scheduler, and cannot enable a paid call
 * unless a separate privileged caller explicitly supplies a live provider.
 */
export async function runCurrentUserProjectBoundedScan(
  request: SupabaseProjectBoundedScanRequest,
  providerFactory: ClaimedLiveProviderFactory,
  options: Readonly<{
    env?: ServerEnvironment;
    signal?: AbortSignal;
  }> = {},
): Promise<RunCurrentUserProjectBoundedScanResult> {
  if (options.signal?.aborted) return cancelled();

  const env = options.env ?? process.env;
  const config = readServerConfig(env);
  if ("failure" in config) return config;

  const actorClient = await createSupabaseServerClient();
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

  const projectQuery: SupabaseAuthorizedProjectQuery = async (
    workspaceId,
    projectId,
  ) =>
    await actorClient
      .from("projects")
      .select("id,workspace_id,tracked_domain")
      .eq("workspace_id", workspaceId)
      .eq("id", projectId)
      .maybeSingle();

  const actorRpc: SupabaseScanClaimActorRpc = async (name, args) =>
    await actorClient.rpc(name, args as Record<string, unknown>);
  const serviceRpc: SupabaseBoundedScanServiceRpc = async (name, args) =>
    await serviceClient.rpc(name, args as Record<string, unknown>);

  return executeVerifiedProjectBoundedScan(
    request,
    {
      verifier: actorClient,
      projectQuery,
      resolveAddresses: resolveWebsiteAddresses,
      crawler: createNativeEntryCrawler(),
      actorRpc,
      serviceRpc,
      providerFactory,
    },
    options.signal,
  );
}
