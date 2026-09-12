import "server-only";

import {
  request as httpsRequest,
  type RequestOptions as HttpsRequestOptions,
} from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";
import { checkServerIdentity } from "node:tls";

import type { Crawler, CrawlResult } from "../application/crawler.ts";
import {
  isValidatedWebsiteTarget,
  type ValidatedWebsiteTarget,
} from "../application/website-target.ts";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_HTML_TEXT = 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_REDIRECT_VALUE = 2048;
const MAX_TAG_LENGTH = 8192;
const TOTAL_DEADLINE_MS = 15000;

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const suppressedElements = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "math",
  "iframe",
  "object",
  "embed",
  "canvas",
  "form",
  "button",
  "select",
  "textarea",
  "option",
  "nav",
  "footer",
  "aside",
  "blockquote",
  "pre",
  "code",
  "samp",
  "kbd",
]);
const blockElements = new Set([
  "address",
  "article",
  "dd",
  "div",
  "dl",
  "dt",
  "header",
  "main",
  "ol",
  "p",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

export type PinnedHttpsRequest = Readonly<{
  address: string;
  hostname: string;
  path: string;
  signal: AbortSignal;
  headers: Readonly<Record<string, string>>;
}>;

export type PinnedHttpsResponse = Readonly<{
  statusCode: number;
  headers: IncomingHttpHeaders | Readonly<Record<string, string | string[] | undefined>>;
  body: AsyncIterable<Uint8Array>;
  destroy: () => void;
}>;

export type PinnedHttpsExchange = (
  request: PinnedHttpsRequest,
) => Promise<PinnedHttpsResponse>;

type HtmlExtraction = Readonly<{
  markdown: string | null;
  title: string | null;
  description: string | null;
  language: string | null;
}>;

type ParsedTag = Readonly<{
  name: string;
  closing: boolean;
  selfClosing: boolean;
  raw: string;
}>;

function firstHeader(
  headers: PinnedHttpsResponse["headers"],
  name: string,
): string | null {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower) continue;
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length === 1 && value[0] !== undefined)
      return value[0];
    return null;
  }
  return null;
}

function acceptableHtmlContentType(value: string | null): boolean {
  if (value === null) return false;
  const parts = value.split(";").map((part) => part.trim().toLowerCase());
  const mediaType = parts[0];
  if (mediaType !== "text/html" && mediaType !== "application/xhtml+xml")
    return false;
  for (const parameter of parts.slice(1)) {
    const match = /^charset\s*=\s*"?([^";]+)"?$/.exec(parameter);
    if (!match) continue;
    const charset = match[1]?.trim();
    if (charset !== "utf-8" && charset !== "utf8" && charset !== "us-ascii")
      return false;
  }
  return true;
}

function decodeEntity(entity: string): string {
  const lower = entity.toLowerCase();
  if (lower === "amp") return "&";
  if (lower === "lt") return "<";
  if (lower === "gt") return ">";
  if (lower === "quot") return '"';
  if (lower === "apos") return "'";
  if (lower === "nbsp") return " ";

  const numeric = lower.startsWith("#x")
    ? Number.parseInt(lower.slice(2), 16)
    : lower.startsWith("#")
      ? Number.parseInt(lower.slice(1), 10)
      : Number.NaN;
  if (
    !Number.isInteger(numeric) ||
    numeric <= 0 ||
    numeric > 0x10ffff ||
    (numeric >= 0xd800 && numeric <= 0xdfff)
  )
    return `&${entity};`;
  return String.fromCodePoint(numeric);
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[\da-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/gi,
    (_match, entity: string) => decodeEntity(entity),
  );
}

function cleanText(value: string, maxLength = 2000): string | null {
  const text = decodeEntities(value)
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function findTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | null = null;
  const limit = Math.min(html.length, start + MAX_TAG_LENGTH + 1);
  for (let index = start + 1; index < limit; index += 1) {
    const character = html[index];
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return -1;
}

function parseTag(raw: string): ParsedTag | null {
  if (/^<\s*[!?]/.test(raw)) return null;
  const match = /^<\s*(\/)?\s*([A-Za-z][A-Za-z0-9:-]*)/.exec(raw);
  if (!match?.[2]) return null;
  return {
    name: match[2].toLowerCase(),
    closing: match[1] === "/",
    selfClosing: /\/\s*>$/.test(raw),
    raw,
  };
}

function attribute(raw: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`,
    "i",
  );
  const match = pattern.exec(raw.slice(1, -1));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function hasBooleanAttribute(raw: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|=|$)`, "i").test(
    raw.slice(1, -1),
  );
}

function hiddenElement(raw: string): boolean {
  if (hasBooleanAttribute(raw, "hidden")) return true;
  const ariaHidden = attribute(raw, "aria-hidden")?.toLowerCase();
  if (ariaHidden === "true") return true;
  const style = attribute(raw, "style")?.toLowerCase().replace(/\s+/g, "");
  return (
    style?.includes("display:none") === true ||
    style?.includes("visibility:hidden") === true
  );
}

function extractHtml(html: string): HtmlExtraction | null {
  let output = "";
  let titleText = "";
  let title: string | null = null;
  let description: string | null = null;
  let language: string | null = null;
  let inHead = false;
  let inTitle = false;
  const suppressedStack: string[] = [];

  const appendBlockBreak = () => {
    output = output.replace(/[ \t]+$/g, "");
    if (!output) return;
    if (output.endsWith("\n\n")) return;
    output += output.endsWith("\n") ? "\n" : "\n\n";
  };
  const appendLineBreak = () => {
    output = output.replace(/[ \t]+$/g, "");
    if (output && !output.endsWith("\n")) output += "\n";
  };
  const appendText = (raw: string) => {
    const decoded = decodeEntities(raw).replace(/[\p{Cc}\p{Cf}]/gu, " ");
    const text = decoded.replace(/\s+/gu, " ").trim();
    if (!text) return;
    if (
      output &&
      !/[\s\n]$/.test(output) &&
      !/^[,.;:!?)]/.test(text)
    )
      output += " ";
    output += text;
  };

  for (let index = 0; index < html.length; ) {
    if (html.startsWith("<!--", index)) {
      const end = html.indexOf("-->", index + 4);
      if (end === -1) return null;
      index = end + 3;
      continue;
    }
    if (html[index] !== "<") {
      const next = html.indexOf("<", index);
      const end = next === -1 ? html.length : next;
      const text = html.slice(index, end);
      if (inTitle) titleText += ` ${text}`;
      else if (!inHead && suppressedStack.length === 0) appendText(text);
      index = end;
      continue;
    }

    const end = findTagEnd(html, index);
    if (end === -1) return null;
    const raw = html.slice(index, end + 1);
    const tag = parseTag(raw);
    index = end + 1;
    if (tag === null) continue;

    if (suppressedStack.length > 0) {
      if (tag.closing && tag.name === suppressedStack.at(-1)) {
        suppressedStack.pop();
      } else if (
        !tag.closing &&
        !tag.selfClosing &&
        !voidElements.has(tag.name)
      ) {
        suppressedStack.push(tag.name);
      }
      continue;
    }

    if (tag.name === "html" && !tag.closing && language === null) {
      const candidate = attribute(tag.raw, "lang");
      if (candidate !== null) language = cleanText(candidate, 64);
    }
    if (tag.name === "head") {
      inHead = !tag.closing;
      continue;
    }
    if (tag.name === "title") {
      if (tag.closing) {
        inTitle = false;
        title = cleanText(titleText);
      } else {
        inTitle = true;
        titleText = "";
      }
      continue;
    }
    if (tag.name === "meta" && !tag.closing && description === null) {
      const metaName = attribute(tag.raw, "name")?.toLowerCase();
      if (metaName === "description") {
        const content = attribute(tag.raw, "content");
        if (content !== null) description = cleanText(content);
      }
      continue;
    }

    if (inHead) continue;

    if (
      !tag.closing &&
      (suppressedElements.has(tag.name) || hiddenElement(tag.raw))
    ) {
      if (!tag.selfClosing && !voidElements.has(tag.name))
        suppressedStack.push(tag.name);
      continue;
    }

    const heading = /^h([1-6])$/.exec(tag.name);
    if (heading?.[1] !== undefined) {
      appendBlockBreak();
      if (!tag.closing) output += `${"#".repeat(Number(heading[1]))} `;
      else appendBlockBreak();
      continue;
    }
    if (tag.name === "br") {
      appendLineBreak();
      continue;
    }
    if (tag.name === "li") {
      if (!tag.closing) {
        appendLineBreak();
        output += "- ";
      } else appendLineBreak();
      continue;
    }
    if (blockElements.has(tag.name)) appendBlockBreak();
  }

  const markdown = output
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (markdown.length > MAX_HTML_TEXT) return null;

  return {
    markdown: markdown || null,
    title,
    description,
    language,
  };
}

async function readBoundedHtml(
  response: PinnedHttpsResponse,
  signal: AbortSignal,
): Promise<Uint8Array | "too_large" | "invalid"> {
  const declaredLength = firstHeader(response.headers, "content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return "invalid";
    if (Number(declaredLength) > MAX_RESPONSE_BYTES) {
      response.destroy();
      return "too_large";
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    if (signal.aborted) {
      response.destroy();
      throw new Error("Crawl interrupted");
    }
    if (!(chunk instanceof Uint8Array)) {
      response.destroy();
      return "invalid";
    }
    total += chunk.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      response.destroy();
      return "too_large";
    }
    chunks.push(chunk);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function redirectUrl(
  location: string,
  currentUrl: URL,
  target: ValidatedWebsiteTarget,
): URL | null {
  if (
    location.length === 0 ||
    location.length > MAX_REDIRECT_VALUE ||
    /[\p{Cc}\p{Cf}]/u.test(location)
  )
    return null;
  let next: URL;
  try {
    next = new URL(location, currentUrl);
  } catch {
    return null;
  }
  if (
    next.protocol !== "https:" ||
    next.origin !== target.origin ||
    next.username !== "" ||
    next.password !== "" ||
    next.port !== ""
  )
    return null;
  next.hash = "";
  if (`${next.pathname}${next.search}`.length > MAX_REDIRECT_VALUE) return null;
  return next;
}

export function buildPinnedHttpsRequestOptions(
  request: PinnedHttpsRequest,
): HttpsRequestOptions {
  if (isIP(request.address) === 0) throw new TypeError("Pinned address must be an IP");
  return {
    protocol: "https:",
    hostname: request.address,
    port: 443,
    servername: request.hostname,
    method: "GET",
    path: request.path,
    headers: request.headers,
    setHost: false,
    agent: false,
    rejectUnauthorized: true,
    maxHeaderSize: 32 * 1024,
    signal: request.signal,
    checkServerIdentity: (_host, certificate) =>
      checkServerIdentity(request.hostname, certificate),
  };
}

export const nodePinnedHttpsExchange: PinnedHttpsExchange = (request) =>
  new Promise<PinnedHttpsResponse>((resolve, reject) => {
    const clientRequest = httpsRequest(
      buildPinnedHttpsRequestOptions(request),
      (response) => {
        resolve({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body: response,
          destroy: () => response.destroy(),
        });
      },
    );
    clientRequest.once("error", reject);
    clientRequest.end();
  });

/**
 * One static entry page only. This adapter performs no browser execution,
 * subresource loading, proxying or background work. It is intentionally not
 * connected to a route; authorization/usage gates belong to the calling use case.
 */
export function createNativeEntryCrawler(
  options: { exchange?: PinnedHttpsExchange } = {},
): Crawler {
  const exchange = options.exchange ?? nodePinnedHttpsExchange;
  let busy = false;
  return Object.freeze({
    capabilities: Object.freeze({ scope: "entry_page" as const, maxPages: 1 as const }),
    async crawl(target, signal): Promise<CrawlResult> {
      if (!isValidatedWebsiteTarget(target))
        return { ok: false, code: "invalid_target" };
      if (signal?.aborted) return { ok: false, code: "cancelled" };
      if (busy) return { ok: false, code: "busy" };
      const address = target.addresses[0];
      if (address === undefined || isIP(address) === 0)
        return { ok: false, code: "invalid_target" };

      busy = true;
      const controller = new AbortController();
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort = () => {};
      const interrupted = new Promise<never>((_resolve, reject) => {
        onAbort = () => {
          controller.abort();
          reject(new Error("Crawl interrupted"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => {
          timedOut = true;
          onAbort();
        }, TOTAL_DEADLINE_MS);
      });

      const run = async (): Promise<CrawlResult> => {
        let currentUrl = new URL(target.origin);
        for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
          const response = await exchange({
            address,
            hostname: target.hostname,
            path: `${currentUrl.pathname}${currentUrl.search}` || "/",
            signal: controller.signal,
            headers: {
              Accept: "text/html,application/xhtml+xml;q=0.9",
              "Accept-Encoding": "identity",
              "Cache-Control": "no-store",
              Connection: "close",
              Host: target.hostname,
              "User-Agent": "NestedWeb/0.1 entry-page-fetch",
            },
          });
          if (controller.signal.aborted) {
            response.destroy();
            controller.signal.throwIfAborted();
          }

          if (redirectStatuses.has(response.statusCode)) {
            response.destroy();
            if (redirectCount === MAX_REDIRECTS)
              return { ok: false, code: "invalid_response" };
            const location = firstHeader(response.headers, "location");
            if (location === null)
              return { ok: false, code: "invalid_response" };
            const next = redirectUrl(location, currentUrl, target);
            if (next === null) return { ok: false, code: "invalid_response" };
            currentUrl = next;
            continue;
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            response.destroy();
            return { ok: false, code: "provider_error" };
          }
          if (
            !acceptableHtmlContentType(firstHeader(response.headers, "content-type")) ||
            ![null, "identity"].includes(
              firstHeader(response.headers, "content-encoding")?.toLowerCase() ?? null,
            )
          ) {
            response.destroy();
            return { ok: false, code: "invalid_response" };
          }

          const bytes = await readBoundedHtml(response, controller.signal);
          if (bytes === "too_large") return { ok: false, code: "response_too_large" };
          if (bytes === "invalid") return { ok: false, code: "invalid_response" };

          let html: string;
          try {
            html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            return { ok: false, code: "invalid_response" };
          }
          const extracted = extractHtml(html);
          if (extracted === null) return { ok: false, code: "invalid_response" };
          if (
            extracted.markdown === null &&
            extracted.title === null &&
            extracted.description === null
          )
            return { ok: false, code: "empty_result" };

          return {
            ok: true,
            pages: [
              Object.freeze({
                url: currentUrl.toString(),
                sourceUrl: target.origin,
                title: extracted.title,
                description: extracted.description,
                language: extracted.language,
                statusCode: response.statusCode,
                markdown: extracted.markdown,
              }),
            ],
          };
        }
        return { ok: false, code: "invalid_response" };
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
        signal?.removeEventListener("abort", onAbort);
        controller.abort();
        busy = false;
      }
    },
  });
}
