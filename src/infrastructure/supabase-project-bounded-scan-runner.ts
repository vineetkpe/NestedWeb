import "server-only";

import type { Crawler, CrawlResult } from "../application/crawler.ts";
import type { ClaimedLiveProviderFactory } from "../application/claim-scan-execution.ts";
import type { PersistProfilePromptCohortReserveClaimScanRequest } from "../application/profile-prompt-cohort-scan-claim.ts";
import {
  listProjects,
  type ListProjectsResult,
  type ProjectSummary,
} from "../application/projects.ts";
import {
  prepareWebsiteTarget,
  type ValidatedWebsiteTarget,
  type WebsiteAddressResolver,
  type WebsiteTargetResult,
} from "../application/website-target.ts";
import {
  executeSupabaseBoundedScan,
  type ExecuteSupabaseBoundedScanResult,
  type SupabaseBoundedScanServiceRpc,
} from "./supabase-bounded-scan-runner.ts";
import {
  executeSupabaseProjectList,
  type SupabaseProjectListQuery,
} from "./supabase-projects.ts";
import type { SupabaseScanClaimActorRpc } from "./supabase/reserved-scan-claim-runtime.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SupabaseProjectBoundedScanRequest = Omit<
  PersistProfilePromptCohortReserveClaimScanRequest,
  "crawlResult"
>;

type ProjectFailure =
  | Exclude<ListProjectsResult, { ok: true }>
  | Readonly<{ ok: false; code: "invalid_project_id" }>
  | Readonly<{ ok: false; code: "project_access_denied" }>;

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
      project: ProjectSummary;
      failure: TargetFailure;
    }>
  | Readonly<{
      state: "not_executed";
      stage: "crawl";
      project: ProjectSummary;
      target: ValidatedWebsiteTarget;
      failure: CrawlFailure;
    }>
  | Readonly<{
      state: "scan_attempted";
      project: ProjectSummary;
      target: ValidatedWebsiteTarget;
      crawlResult: SuccessfulCrawl;
      scan: ExecuteSupabaseBoundedScanResult;
    }>;

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

/**
 * C8 domain -> crawl -> durable scan composition. The project query must run on
 * the authenticated actor channel: its RLS-visible durable `tracked_domain` is
 * the only crawl target accepted here. DNS screening and the crawler both run
 * before any profile/provider work, and their exact successful crawl object is
 * handed to the existing durable scan runtime without reconstruction.
 */
export async function executeSupabaseProjectBoundedScan(
  request: SupabaseProjectBoundedScanRequest,
  projectQuery: SupabaseProjectListQuery,
  resolveAddresses: WebsiteAddressResolver,
  crawler: Crawler,
  actorRpc: SupabaseScanClaimActorRpc,
  serviceRpc: SupabaseBoundedScanServiceRpc,
  providerFactory: ClaimedLiveProviderFactory,
  signal?: AbortSignal,
): Promise<ExecuteSupabaseProjectBoundedScanResult> {
  if (signal?.aborted) return cancelled();

  const projectId = normalizeUuid(request.projectId);
  if (projectId === null)
    return Object.freeze({
      state: "not_executed" as const,
      stage: "project" as const,
      failure: Object.freeze({
        ok: false as const,
        code: "invalid_project_id" as const,
      }),
    });

  const listed = await listProjects(
    { workspaceId: request.workspaceId },
    (validated) => executeSupabaseProjectList(validated, projectQuery),
  );
  if (!listed.ok)
    return Object.freeze({
      state: "not_executed" as const,
      stage: "project" as const,
      failure: listed,
    });
  if (signal?.aborted) return cancelled();

  const project = listed.projects.find((value) => value.projectId === projectId);
  if (project === undefined)
    return Object.freeze({
      state: "not_executed" as const,
      stage: "project" as const,
      failure: Object.freeze({
        ok: false as const,
        code: "project_access_denied" as const,
      }),
    });

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
