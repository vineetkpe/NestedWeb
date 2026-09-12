import { extractCompanyProfile } from "./company-profile.ts";
import type { CrawlPage, CrawlResult } from "./crawler.ts";
import type { CompanyProfile } from "../domain/company-profile.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const COMPANY_PROFILE_CAPTURE_METHOD_VERSION =
  "native-entry-page-v1" as const;

export type PersistCompanyProfileRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  idempotencyKey: unknown;
  capturedAt: unknown;
  crawlResult: unknown;
}>;

export type ValidatedCompanyProfilePersistenceRequest = Readonly<{
  workspaceId: string;
  projectId: string;
  idempotencyKey: string;
  captureMethodVersion: typeof COMPANY_PROFILE_CAPTURE_METHOD_VERSION;
  capturedAt: string;
  crawlResult: Extract<CrawlResult, { ok: true }>;
  profile: CompanyProfile;
}>;

export type CompanyProfileSnapshotSummary = Readonly<{
  snapshotId: string;
  requestFingerprint: string;
  reviewState: "pending_review";
  replayed: boolean;
}>;

export type CompanyProfilePersistenceGatewayFailureCode =
  "idempotency_conflict" | "database_error" | "invalid_database_response";

export type CompanyProfilePersistenceGatewayResult =
  | Readonly<{ ok: true; snapshot: CompanyProfileSnapshotSummary }>
  | Readonly<{
      ok: false;
      code: CompanyProfilePersistenceGatewayFailureCode;
    }>;

export type CompanyProfilePersistenceGateway = (
  request: ValidatedCompanyProfilePersistenceRequest,
) => Promise<CompanyProfilePersistenceGatewayResult>;

export type PersistCompanyProfileResult =
  | CompanyProfilePersistenceGatewayResult
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "invalid_project_id"
        | "invalid_idempotency_key"
        | "invalid_captured_at"
        | "invalid_crawl"
        | "crawl_failed"
        | "input_too_large";
    }>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    RFC3339_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function boundedStringOrNull(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    !value.isWellFormed()
  )
    return undefined;
  return value;
}

function snapshotPage(value: unknown): CrawlPage | null {
  if (!record(value)) return null;

  const url = boundedStringOrNull(value.url, 2048);
  const sourceUrl = boundedStringOrNull(value.sourceUrl, 2048);
  const title = boundedStringOrNull(value.title, 1024);
  const description = boundedStringOrNull(value.description, 4096);
  const language = boundedStringOrNull(value.language, 64);
  const markdown = boundedStringOrNull(value.markdown, 1024 * 1024);
  const statusCode = value.statusCode;

  if (
    typeof url !== "string" ||
    sourceUrl === undefined ||
    title === undefined ||
    description === undefined ||
    language === undefined ||
    markdown === undefined ||
    (statusCode !== null &&
      (typeof statusCode !== "number" ||
        !Number.isInteger(statusCode) ||
        statusCode < 100 ||
        statusCode > 599))
  )
    return null;

  return Object.freeze({
    url,
    sourceUrl,
    title,
    description,
    language,
    statusCode,
    markdown,
  });
}

function snapshotCrawlResult(
  value: unknown,
): Extract<CrawlResult, { ok: true }> | null {
  if (!record(value) || value.ok !== true || !Array.isArray(value.pages))
    return null;
  if (value.pages.length !== 1) return null;

  const page = snapshotPage(value.pages[0]);
  if (page === null) return null;
  return Object.freeze({ ok: true as const, pages: Object.freeze([page]) });
}

/**
 * Persists only a bounded native entry-page capture. The Company Profile is
 * recomputed here from the sanitized crawl snapshot, so callers cannot supply
 * or alter interpreted facts/evidence independently of the stored source.
 */
export async function persistCompanyProfile(
  request: PersistCompanyProfileRequest,
  gateway: CompanyProfilePersistenceGateway,
): Promise<PersistCompanyProfileResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) return { ok: false, code: "invalid_workspace_id" };

  const projectId = normalizeUuid(request.projectId);
  if (projectId === null) return { ok: false, code: "invalid_project_id" };

  const idempotencyKey = normalizeUuid(request.idempotencyKey);
  if (idempotencyKey === null)
    return { ok: false, code: "invalid_idempotency_key" };

  if (!validTimestamp(request.capturedAt))
    return { ok: false, code: "invalid_captured_at" };

  if (record(request.crawlResult) && request.crawlResult.ok === false) {
    const extracted = extractCompanyProfile(request.crawlResult);
    return {
      ok: false,
      code: extracted.ok ? "invalid_crawl" : extracted.code,
    };
  }

  const crawlResult = snapshotCrawlResult(request.crawlResult);
  if (crawlResult === null) return { ok: false, code: "invalid_crawl" };

  const extracted = extractCompanyProfile(crawlResult);
  if (!extracted.ok) return extracted;

  return gateway(
    Object.freeze({
      workspaceId,
      projectId,
      idempotencyKey,
      captureMethodVersion: COMPANY_PROFILE_CAPTURE_METHOD_VERSION,
      capturedAt: request.capturedAt,
      crawlResult,
      profile: extracted.profile,
    }),
  );
}
