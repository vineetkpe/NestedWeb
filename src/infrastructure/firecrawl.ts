import "server-only";
import {
  readProviderBody,
  discard,
  ResponseTooLarge,
} from "./provider-response-body.ts";
import type { Crawler, CrawlResult } from "../application/crawler.ts";
import {
  isValidatedWebsiteTarget,
  type ValidatedWebsiteTarget,
} from "../application/website-target.ts";
import { normalizeFirecrawlResponse } from "./firecrawl-response.ts";

export type FirecrawlRequest = Readonly<{
  url: "https://api.firecrawl.dev/v2/scrape";
  target: ValidatedWebsiteTarget;
  init: Readonly<{
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: string;
    signal: AbortSignal;
    redirect: "error";
    cache: "no-store";
  }>;
}>;

/** Trusted infrastructure seam, currently mocked only. No default fetch exists.
 * Before a live implementation, enforce ADR-008's egress and usage prerequisites.
 * Never log this request: its authorization header contains a credential.
 */
export type FirecrawlExchange = (
  request: FirecrawlRequest,
) => Promise<Response>;
type FirecrawlSetup =
  | { ok: true; crawler: Crawler }
  | { ok: false; code: "missing_credential" | "invalid_credential" };

function httpFailure(status: number): CrawlResult {
  if (status === 401 || status === 403)
    return { ok: false, code: "unauthorized" };
  if (status === 402) return { ok: false, code: "quota_exceeded" };
  if (status === 429) return { ok: false, code: "rate_limited" };
  if (status >= 500) return { ok: false, code: "provider_unavailable" };
  return { ok: false, code: "provider_error" };
}

/** Credential is read only on explicit setup, retained in a server-only closure. */
export function createFirecrawlCrawler(
  options: {
    env?: Readonly<Record<string, unknown>>;
    exchange?: FirecrawlExchange;
  } = {},
): FirecrawlSetup {
  const key: unknown = (options.env ?? process.env).FIRECRAWL_API_KEY;
  if (key === undefined || key === "")
    return { ok: false, code: "missing_credential" };
  if (
    typeof key !== "string" ||
    !/^fc-[a-z\d_-]+$/i.test(key) ||
    key.length > 256
  ) {
    return { ok: false, code: "invalid_credential" };
  }
  const exchange = options.exchange;
  let busy = false;
  const crawler: Crawler = {
    capabilities: Object.freeze({ scope: "entry_page", maxPages: 1 }),
    async crawl(target, signal): Promise<CrawlResult> {
      if (!isValidatedWebsiteTarget(target))
        return { ok: false, code: "invalid_target" };
      if (signal?.aborted) return { ok: false, code: "cancelled" };
      if (!exchange) return { ok: false, code: "live_crawl_unavailable" };
      if (busy) return { ok: false, code: "busy" };
      busy = true;
      const controller = new AbortController();
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abort = () => {};
      const interrupted = new Promise<never>((_resolve, reject) => {
        abort = () => {
          reject(new Error("Crawl interrupted"));
          controller.abort();
        };
        signal?.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => {
          timedOut = true;
          abort();
        }, 20000);
      });
      const run = async (): Promise<CrawlResult> => {
        const response = await exchange({
          url: "https://api.firecrawl.dev/v2/scrape",
          target,
          init: {
            method: "POST",
            redirect: "error",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: target.origin,
              formats: ["markdown"],
              onlyMainContent: true,
              skipTlsVerification: false,
              timeout: 15000,
              parsers: [],
              storeInCache: false,
            }),
          },
        });
        if (controller.signal.aborted) {
          discard(response.body);
          controller.signal.throwIfAborted();
        }
        if (!response.ok) {
          discard(response.body);
          return httpFailure(response.status);
        }
        let payload: unknown;
        try {
          const text = await readProviderBody(response, controller.signal);
          payload = JSON.parse(text);
        } catch (error) {
          if (error instanceof ResponseTooLarge)
            return { ok: false, code: "response_too_large" };
          if (controller.signal.aborted) throw error;
          return { ok: false, code: "invalid_response" };
        }
        const result = normalizeFirecrawlResponse(payload, target);
        // Even an unexpected provider echo must not move our credential downstream.
        return JSON.stringify(result).includes(key)
          ? { ok: false, code: "invalid_response" }
          : result;
      };
      try {
        const result = await Promise.race([run(), interrupted]);
        if (signal?.aborted) return { ok: false, code: "cancelled" };
        if (timedOut) return { ok: false, code: "timeout" };
        return result;
      } catch {
        if (signal?.aborted) return { ok: false, code: "cancelled" };
        return { ok: false, code: timedOut ? "timeout" : "network_error" };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        controller.abort();
        busy = false;
      }
    },
  };
  return { ok: true, crawler: Object.freeze(crawler) };
}
