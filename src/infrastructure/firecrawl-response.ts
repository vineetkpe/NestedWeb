import type { CrawlResult } from "../application/crawler.ts";
import type { ValidatedWebsiteTarget } from "../application/website-target.ts";
import { normalizeWebsite } from "../domain/website.ts";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > maxLength) return undefined;
  return value.trim() ? value : null;
}

function reportedUrl(
  value: unknown,
  target: ValidatedWebsiteTarget,
): string | null {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  const normalized = normalizeWebsite(value);
  if (!normalized.ok || normalized.value.origin !== target.origin) return null;
  // Keep the actual path/query as evidence; never resolve or follow this URL.
  const parsed = new URL(value);
  return parsed.origin === target.origin ? parsed.href : null;
}

/** Firecrawl v2 /scrape response, validated from unknown; no raw metadata escape. */
export function normalizeFirecrawlResponse(
  payload: unknown,
  target: ValidatedWebsiteTarget,
): CrawlResult {
  const invalid: CrawlResult = { ok: false, code: "invalid_response" };
  if (!record(payload) || typeof payload.success !== "boolean") return invalid;
  if (!payload.success) return { ok: false, code: "provider_error" };
  const data = payload.data;
  if (data === null || (record(data) && Object.keys(data).length === 0)) {
    return { ok: false, code: "empty_result" };
  }
  if (!record(data)) return invalid;
  const metadata = data.metadata;
  if (!record(metadata)) return invalid;
  const title = optionalText(metadata.title, 4096);
  const description = optionalText(metadata.description, 16384);
  const language = optionalText(metadata.language, 128);
  const markdown = optionalText(data.markdown, 2 * 1024 * 1024);
  if (
    title === undefined ||
    description === undefined ||
    language === undefined ||
    markdown === undefined
  )
    return invalid;
  const statusCode = metadata.statusCode ?? null;
  if (
    statusCode !== null &&
    (typeof statusCode !== "number" ||
      !Number.isInteger(statusCode) ||
      statusCode < 100 ||
      statusCode > 599)
  )
    return invalid;
  if (
    (typeof statusCode === "number" &&
      (statusCode < 200 || statusCode >= 300)) ||
    (metadata.error !== undefined &&
      metadata.error !== null &&
      metadata.error !== "")
  ) {
    return { ok: false, code: "provider_error" };
  }
  const sourceUrl =
    metadata.sourceURL == null ? null : reportedUrl(metadata.sourceURL, target);
  const finalUrl =
    metadata.url == null ? null : reportedUrl(metadata.url, target);
  if (
    (metadata.sourceURL != null && sourceUrl === null) ||
    (metadata.url != null && finalUrl === null)
  )
    return invalid;
  const url = finalUrl ?? sourceUrl;
  if (!url) return invalid;
  if (markdown === null && title === null && description === null)
    return { ok: false, code: "empty_result" };
  return {
    ok: true,
    pages: [
      { url, sourceUrl, title, description, language, statusCode, markdown },
    ],
  };
}
