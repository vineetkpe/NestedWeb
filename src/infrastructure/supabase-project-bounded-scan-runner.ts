import "server-only";

import type { Crawler, CrawlResult } from "../application/crawler.ts";
import type { ClaimedLiveProviderFactory } from "../application/claim-scan-execution.ts";
import type { PersistProfilePromptCohortReserveClaimScanRequest } from "../application/profile-prompt-cohort-scan-claim.ts";
import {
  prepareWebsiteTarget,
  type ValidatedWebsiteTarget,
  type WebsiteAddressResolver,
  type WebsiteTargetResult,
} from "../application/website-target.ts";
import { normalizeWebsite } from "../domain/website.ts";
import {
  executeSupabaseBoundedScan,
  type ExecuteSupabaseBoundedScanResult,
  type SupabaseBoundedScanServiceRpc,
} from "./supabase-bounded-scan-runner.ts";
import type { SupabaseScanClaimActorRpc } from "./supabase/reserved-scan-claim-runtime.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SupabaseProjectBoundedScanRequest = Omit<
  PersistProfilePromptCohortReserveClaimScanRequest,
  "crawlResult"
>;

export type AuthorizedProjectScanTarget = Readonly<{
  workspaceId: string;
  projectId: string;
  trackedDomain: string;
}>;

/**
 * Must be implemented by an authenticated actor-scoped exact query that can
 * return at most one project row, e.g. workspace + project equality followed by
 * maybeSingle(). Service-role project lookup is not valid for this boundary.
 */
export type SupabaseAuthorizedProjectQuery = (
  workspaceId: string,
  projectId: string,
) => Promise<unknown>;

type ProjectFailure = Readonly<{
  ok: false;
  code:
    | "invalid_workspace_id"
    | "invalid_project_id"
    | "project_access_denied"
    | "authorization_denied"
    | "database_error"
    | "invalid_database_response";
}>;

type TargetFailure = Extract<WebsiteTargetResult, { ok: false }>;
type SuccessfulCrawl = Extract<CrawlResult, { ok: true }>;
type CrawlFailure = Extract<CrawlResult, { ok: false }>;

export type ExecuteSupabaseProjectBoundedScanResult =
  | Readonly<{
      state: "not_executed";
      stage: "cancelled";
      failure: Readonly<{ ok: false; code: "cancelled" }>;
    }>
  | Readonly<{
      state: "not_executed";
      stage: "project";
      failure: ProjectFailure;
    }>
  | Readonly<{
      state: "not_executed";
      stage: "target";
      project: AuthorizedProjectScanTarget;
      failure: TargetFailure;
    }>
  | Readonly<{
      state: "not_executed";
      stage: "crawl";
      project: AuthorizedProjectScanTarget;
      target: ValidatedWebsiteTarget;
      failure: CrawlFailure;
    }>
  | Readonly<{
      state: "scan_attempted";
      project: AuthorizedProjectScanTarget;
      target: ValidatedWebsiteTarget;
      crawlResult: SuccessfulCrawl;
      scan: ExecuteSupabaseBoundedScanResult;
    }>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(code: ProjectFailure["code"]): ProjectFailure {
  return Object.freeze({ ok: false as const, code });
}

function cancelled(): ExecuteSupabaseProjectBoundedScanResult {
  return Object.freeze({
    state: "not_executed" as const,
    stage: "cancelled" as const,
    failure: Object.freeze({ ok: false as const, code: "cancelled" as const }),
  });
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  return UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function parseAuthorizedProject(
  value: unknown,
  workspaceId: string,
  projectId: string,
): AuthorizedProjectScanTarget | null {
  if (!record(value)) return null;
  if (value.id !== projectId || value.workspace_id !== workspaceId) return null;
  if (typeof value.tracked_domain !== "string") return null;

  const website = normalizeWebsite(value.tracked_domain);
  if (!website.ok || website.value.hostname !== value.tracked_domain)
    return null;

  return Object.freeze({
    workspaceId,
    projectId,
    trackedDomain: value.tracked_domain,
  });
}

async function loadAuthorizedProject(
  workspaceId: string,
  projectId: string,
  query: SupabaseAuthorizedProjectQuery,
): Promise<
  Readonly<{ ok: true; project: AuthorizedProjectScanTarget }> | ProjectFailure
> {
  let response: unknown;
  try {
    response = await query(workspaceId, projectId);
  } catch {
    return failure("database_error");
  }

  if (
    !record(response) ||
    !Object.hasOwn(response, "data") ||
    !Object.hasOwn(response, "error")
  )
    return failure("invalid_database_response");

  if (response.error !== null && response.error !== undefined) {
    if (record(response.error) && response.error.code === "42501")
      return failure("authorization_denied");
    return failure("database_error");
  }
  if (response.data === null) return failure("project_access_denied");

  const project = parseAuthorizedProject(response.data, workspaceId, projectId);
  if (project === null) return failure("invalid_database_response");
  return Object.freeze({ ok: true as const, project });
}

/**
 * C8 domain -> crawl -> durable scan composition. The exact project query must
 * run on the authenticated actor channel: its RLS-visible durable
 * `tracked_domain` is the only crawl target accepted here. DNS screening and
 * the crawler both run before profile/provider work, and the exact successful
 * crawl object is handed to the existing durable scan runtime unchanged.
 */
export async function executeSupabaseProjectBoundedScan(
  request: SupabaseProjectBoundedScanRequest,
  projectQuery: SupabaseAuthorizedProjectQuery,
  resolveAddresses: WebsiteAddressResolver,
  crawler: Crawler,
  actorRpc: SupabaseScanClaimActorRpc,
  serviceRpc: SupabaseBoundedScanServiceRpc,
  providerFactory: ClaimedLiveProviderFactory,
  signal?: AbortSignal,
): Promise<ExecuteSupabaseProjectBoundedScanResult> {
  if (signal?.aborted) return cancelled();

  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null)
    return Object.freeze({
      state: "not_executed" as const,
      stage: "project" as const,
      failure: failure("invalid_workspace_id"),
    });
  const projectId = normalizeUuid(request.projectId);
  if (projectId === null)
    return Object.freeze({
      state: "not_executed" as const,
      stage: "project" as const,
      failure: failure("invalid_project_id"),
    });

  const loaded = await loadAuthorizedProject(
    workspaceId,
    projectId,
    projectQuery,
  );
  if (!loaded.ok)
    return Object.freeze({
      state: "not_executed" as const,
      stage: "project" as const,
      failure: loaded,
    });
  if (signal?.aborted) return cancelled();

  const project = loaded.project;
  const prepared = await prepareWebsiteTarget(
    project.trackedDomain,
    resolveAddresses,
    signal,
  );
  if (!prepared.ok)
    return Object.freeze({
      state: "not_executed" as const,
      stage: "target" as const,
      project,
      failure: prepared,
    });
  if (signal?.aborted) return cancelled();

  const crawlResult = await crawler.crawl(prepared.value, signal);
  if (!crawlResult.ok)
    return Object.freeze({
      state: "not_executed" as const,
      stage: "crawl" as const,
      project,
      target: prepared.value,
      failure: crawlResult,
    });
  if (signal?.aborted) return cancelled();

  const scan = await executeSupabaseBoundedScan(
    Object.freeze({ ...request, crawlResult }),
    actorRpc,
    serviceRpc,
    providerFactory,
    signal,
  );

  return Object.freeze({
    state: "scan_attempted" as const,
    project,
    target: prepared.value,
    crawlResult,
    scan,
  });
}
