import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { extractCompanyProfile } from "../application/company-profile.ts";
import { prepareWebsiteTarget } from "../application/website-target.ts";
import {
  buildPinnedHttpsRequestOptions,
  createNativeEntryCrawler,
  type PinnedHttpsExchange,
  type PinnedHttpsResponse,
} from "./native-entry-crawler.ts";

const ip = "1.1.1.1";

async function target() {
  const result = await prepareWebsiteTarget("example.com", async () => [ip]);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("fixture target failed");
  return result.value;
}

function body(value: string | Uint8Array): AsyncIterable<Uint8Array> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return (async function* () {
    yield bytes;
  })();
}

function response(
  statusCode: number,
  value: string | Uint8Array = "",
  headers: Readonly<Record<string, string | string[] | undefined>> = {
    "content-type": "text/html; charset=utf-8",
  },
): PinnedHttpsResponse {
  let destroyed = false;
  return {
    statusCode,
    headers,
    body: body(value),
    destroy() {
      destroyed = true;
    },
    get destroyed() {
      return destroyed;
    },
  } as PinnedHttpsResponse;
}

function html(content: string): string {
  return `<!doctype html><html lang="en"><head><title>Fixture title</title><meta name="description" content="Fixture description"></head><body>${content}</body></html>`;
}

test("buildPinnedHttpsRequestOptions dials the screened IP while preserving hostname TLS identity", () => {
  const controller = new AbortController();
  const options = buildPinnedHttpsRequestOptions({
    address: ip,
    hostname: "example.com",
    path: "/about?x=1",
    signal: controller.signal,
    headers: { Host: "example.com" },
  });

  assert.equal(options.protocol, "https:");
  assert.equal(options.hostname, ip);
  assert.equal(options.port, 443);
  assert.equal(options.servername, "example.com");
  assert.equal(options.method, "GET");
  assert.equal(options.path, "/about?x=1");
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.agent, false);
  assert.equal(options.setHost, false);
  assert.equal(options.signal, controller.signal);
  assert.deepEqual(options.headers, { Host: "example.com" });
  assert.equal(Object.hasOwn(options, "lookup"), false);
  assert.equal(Object.hasOwn(options, "proxy"), false);
});

test("native crawler uses the exact screened address and extracts inert entry-page text", async () => {
  const validated = await target();
  let captured: unknown;
  const crawler = createNativeEntryCrawler({
    exchange: async (request) => {
      captured = request;
      return response(
        200,
        html(`
          <nav>Company name: Evil Navigation</nav>
          <script>Company name: Script Injection</script>
          <style>.x { display:block }</style>
          <div hidden>Company name: Hidden Claim</div>
          <main>
            <h1>About us</h1>
            <p>Company name: Example Corp</p>
            <p>Primary product: Evidence Platform</p>
          </main>
          <footer>Company name: Footer Claim</footer>
        `),
      );
    },
  });

  const result = await crawler.crawl(validated);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.pages.length, 1);
  const page = result.pages[0];
  assert.equal(page?.url, "https://example.com/");
  assert.equal(page?.sourceUrl, "https://example.com");
  assert.equal(page?.title, "Fixture title");
  assert.equal(page?.description, "Fixture description");
  assert.equal(page?.language, "en");
  assert.equal(page?.statusCode, 200);
  assert.match(page?.markdown ?? "", /^# About us/m);
  assert.match(page?.markdown ?? "", /Company name: Example Corp/);
  assert.match(page?.markdown ?? "", /Primary product: Evidence Platform/);
  assert.doesNotMatch(page?.markdown ?? "", /Script Injection|Hidden Claim|Footer Claim|Evil Navigation/);

  assert.deepEqual(captured, {
    address: ip,
    hostname: "example.com",
    path: "/",
    signal: (captured as { signal: AbortSignal }).signal,
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9",
      "Accept-Encoding": "identity",
      "Cache-Control": "no-store",
      Connection: "close",
      Host: "example.com",
      "User-Agent": "NestedWeb/0.1 entry-page-fetch",
    },
  });

  const profile = extractCompanyProfile(result);
  assert.equal(profile.ok, true);
  if (!profile.ok) return;
  assert.deepEqual(profile.profile.fields.companyName, {
    status: "confirmed",
    values: [
      {
        value: "Example Corp",
        evidence: [
          {
            pageIndex: 0,
            pageUrl: "https://example.com/",
            contentField: "markdown",
            start: (page?.markdown ?? "").indexOf("Company name: Example Corp"),
            end:
              (page?.markdown ?? "").indexOf("Company name: Example Corp") +
              "Company name: Example Corp".length,
            quote: "Company name: Example Corp",
          },
        ],
      },
    ],
  });
});

test("same-origin redirects remain on the same pinned address and are bounded", async () => {
  const calls: { address: string; hostname: string; path: string }[] = [];
  const crawler = createNativeEntryCrawler({
    exchange: async (request) => {
      calls.push({
        address: request.address,
        hostname: request.hostname,
        path: request.path,
      });
      if (calls.length === 1)
        return response(302, "", { location: "/about?source=redirect" });
      return response(200, html("<h1>About us</h1><p>Company name: Example Corp</p>"));
    },
  });

  const result = await crawler.crawl(await target());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.pages[0]?.url, "https://example.com/about?source=redirect");
  assert.deepEqual(calls, [
    { address: ip, hostname: "example.com", path: "/" },
    {
      address: ip,
      hostname: "example.com",
      path: "/about?source=redirect",
    },
  ]);
});

for (const location of [
  "http://example.com/",
  "https://evil.com/",
  "https://user:pass@example.com/",
  "https://example.com:8443/",
  "https://127.0.0.1/",
]) {
  test(`unsafe redirect ${location} is rejected before a second request`, async () => {
    let calls = 0;
    const result = await createNativeEntryCrawler({
      exchange: async () => {
        calls += 1;
        return response(302, "", { location });
      },
    }).crawl(await target());
    assert.deepEqual(result, { ok: false, code: "invalid_response" });
    assert.equal(calls, 1);
  });
}

test("redirect loops are capped", async () => {
  let calls = 0;
  const result = await createNativeEntryCrawler({
    exchange: async () => {
      calls += 1;
      return response(302, "", { location: `/step-${calls}` });
    },
  }).crawl(await target());
  assert.deepEqual(result, { ok: false, code: "invalid_response" });
  assert.equal(calls, 4);
});

for (const [headers, expected] of [
  [{ "content-type": "application/json" }, "invalid_response"],
  [
    { "content-type": "text/html; charset=iso-8859-1" },
    "invalid_response",
  ],
  [
    { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip" },
    "invalid_response",
  ],
  [
    { "content-type": "text/html", "content-length": "not-a-number" },
    "invalid_response",
  ],
] as const) {
  test(`fails closed for unsupported response headers ${JSON.stringify(headers)}`, async () => {
    const result = await createNativeEntryCrawler({
      exchange: async () => response(200, html("Fixture"), headers),
    }).crawl(await target());
    assert.deepEqual(result, { ok: false, code: expected });
  });
}

test("declared oversized responses fail without reading accepted content", async () => {
  const result = await createNativeEntryCrawler({
    exchange: async () =>
      response(200, "ignored", {
        "content-type": "text/html",
        "content-length": String(2 * 1024 * 1024 + 1),
      }),
  }).crawl(await target());
  assert.deepEqual(result, { ok: false, code: "response_too_large" });
});

test("streamed oversized responses are bounded", async () => {
  const crawler = createNativeEntryCrawler({
    exchange: async () => ({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: (async function* () {
        yield new Uint8Array(1024 * 1024);
        yield new Uint8Array(1024 * 1024);
        yield new Uint8Array(1);
      })(),
      destroy() {},
    }),
  });
  assert.deepEqual(await crawler.crawl(await target()), {
    ok: false,
    code: "response_too_large",
  });
});

test("invalid UTF-8 is rejected", async () => {
  const result = await createNativeEntryCrawler({
    exchange: async () =>
      response(200, new Uint8Array([0xc3, 0x28]), {
        "content-type": "text/html; charset=utf-8",
      }),
  }).crawl(await target());
  assert.deepEqual(result, { ok: false, code: "invalid_response" });
});

test("non-success HTTP responses do not become crawl evidence", async () => {
  for (const statusCode of [400, 404, 429, 500]) {
    const result = await createNativeEntryCrawler({
      exchange: async () => response(statusCode, "provider details"),
    }).crawl(await target());
    assert.deepEqual(result, { ok: false, code: "provider_error" });
  }
});

test("empty HTML remains explicit rather than fabricated evidence", async () => {
  const result = await createNativeEntryCrawler({
    exchange: async () => response(200, "<html><body><script>only script</script></body></html>"),
  }).crawl(await target());
  assert.deepEqual(result, { ok: false, code: "empty_result" });
});

test("raw, copied and forged targets cannot reach the exchange", async () => {
  const validated = await target();
  let calls = 0;
  const crawler = createNativeEntryCrawler({
    exchange: async () => {
      calls += 1;
      return response(200, html("Fixture"));
    },
  });
  for (const value of [
    "https://example.com",
    null,
    { ...validated },
    { origin: "https://example.com", hostname: "example.com", addresses: [ip] },
  ]) {
    const result: unknown = await Reflect.apply(crawler.crawl, crawler, [value]);
    assert.deepEqual(result, { ok: false, code: "invalid_target" });
  }
  assert.equal(calls, 0);
});

test("caller cancellation aborts active work and releases the busy guard", async () => {
  const validated = await target();
  const controller = new AbortController();
  let exchangeSignal: AbortSignal | undefined;
  const crawler = createNativeEntryCrawler({
    exchange: async (request) => {
      exchangeSignal = request.signal;
      return new Promise<PinnedHttpsResponse>(() => {});
    },
  });
  const pending = crawler.crawl(validated, controller.signal);
  assert.deepEqual(await crawler.crawl(validated), { ok: false, code: "busy" });
  controller.abort();
  assert.deepEqual(await pending, { ok: false, code: "cancelled" });
  assert.equal(exchangeSignal?.aborted, true);
});

test("stalled exchanges are bounded by the total deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let exchangeSignal: AbortSignal | undefined;
  const pending = createNativeEntryCrawler({
    exchange: async (request) => {
      exchangeSignal = request.signal;
      return new Promise<PinnedHttpsResponse>(() => {});
    },
  }).crawl(await target());
  t.mock.timers.tick(15000);
  assert.deepEqual(await pending, { ok: false, code: "timeout" });
  assert.equal(exchangeSignal?.aborted, true);
});

test("network failures are sanitized", async () => {
  const result = await createNativeEntryCrawler({
    exchange: async () => {
      throw new Error("sensitive transport detail");
    },
  }).crawl(await target());
  assert.deepEqual(result, { ok: false, code: "network_error" });
});

test("native crawler remains server-only", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "await import('./src/infrastructure/native-entry-crawler.ts')",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 10000,
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot be imported from a Client Component/);
});
