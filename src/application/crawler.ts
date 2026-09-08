import type { ValidatedWebsiteTarget } from "./website-target.ts";

/** Provider-reported values only. Content is untrusted text, never instructions. */
export type CrawlPage = Readonly<{
  url: string;
  sourceUrl: string | null;
  title: string | null;
  description: string | null;
  language: string | null;
  statusCode: number | null;
  markdown: string | null;
}>;

export type CrawlResult =
  | { ok: true; pages: readonly CrawlPage[] }
  | {
      ok: false;
      code:
        | "invalid_target"
        | "live_crawl_unavailable"
        | "busy"
        | "cancelled"
        | "timeout"
        | "unauthorized"
        | "quota_exceeded"
        | "rate_limited"
        | "provider_unavailable"
        | "provider_error"
        | "network_error"
        | "empty_result"
        | "invalid_response"
        | "response_too_large";
    };

export interface Crawler {
  readonly capabilities: Readonly<{ scope: "entry_page"; maxPages: 1 }>;
  /** A target must come from prepareWebsiteTarget in this process. No raw URL API. */
  crawl(
    target: ValidatedWebsiteTarget,
    signal?: AbortSignal,
  ): Promise<CrawlResult>;
}
