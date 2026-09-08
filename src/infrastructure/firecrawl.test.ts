import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { prepareWebsiteTarget } from "../application/website-target.ts";
import { createFirecrawlCrawler, type FirecrawlExchange } from "./firecrawl.ts";

const credential = "fc-unit-test-fixture-not-a-real-key";
const env = { FIRECRAWL_API_KEY: credential };
const document = {
  success: true,
  data: {
    markdown: "# Test-only company\nFixture page content.",
    metadata: {
      sourceURL: "https://example.com/",
      url: "https://example.com/about",
      title: "Test-only company",
      description: "Fixture description",
      language: "en",
      statusCode: 200,
      ignored: "must not leak",
      error: null,
    },
    html: "<script>untrusted()</script>",
  },
};

async function target() {
  const result = await prepareWebsiteTarget("example.com", async () => [
    "1.1.1.1",
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("fixture target failed");
  return result.value;
}

function crawler(exchange?: FirecrawlExchange) {
  const result = createFirecrawlCrawler({
    env,
    ...(exchange ? { exchange } : {}),
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("fixture config failed");
  return result.crawler;
}

test("builds one fixed bounded Firecrawl request and normalizes real response fields", async () => {
  const validated = await target();
  let attempts = 0;
  const adapter = crawler(async (request) => {
    attempts++;
    assert.equal(request.target, validated);
    assert.equal(request.url, "https://api.firecrawl.dev/v2/scrape");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.redirect, "error");
    assert.equal(request.init.cache, "no-store");
    assert.equal(
      new Headers(request.init.headers).get("authorization"),
      `Bearer ${credential}`,
    );
    assert.equal(request.init.body.includes(credential), false);
    assert.deepEqual(JSON.parse(request.init.body), {
      url: "https://example.com",
      formats: ["markdown"],
      onlyMainContent: true,
      skipTlsVerification: false,
      timeout: 15000,
      parsers: [],
      storeInCache: false,
    });
    return Response.json(document);
  });
  assert.deepEqual(adapter.capabilities, { scope: "entry_page", maxPages: 1 });
  assert.deepEqual(await adapter.crawl(validated), {
    ok: true,
    pages: [
      {
        url: "https://example.com/about",
        sourceUrl: "https://example.com/",
        title: "Test-only company",
        description: "Fixture description",
        language: "en",
        statusCode: 200,
        markdown: "# Test-only company\nFixture page content.",
      },
    ],
  });
  assert.equal(attempts, 1);
  assert.equal(JSON.stringify(adapter).includes(credential), false);
});

test("absent metadata fields remain null without fabricated values", async () => {
  const result = await crawler(async () =>
    Response.json({
      success: true,
      data: {
        markdown: "Fixture",
        metadata: { sourceURL: "https://example.com/" },
      },
    }),
  ).crawl(await target());
  assert.deepEqual(result, {
    ok: true,
    pages: [
      {
        url: "https://example.com/",
        sourceUrl: "https://example.com/",
        markdown: "Fixture",
        title: null,
        description: null,
        language: null,
        statusCode: null,
      },
    ],
  });
});

test("title-only provider output is retained with unavailable markdown", async () => {
  const result = await crawler(async () =>
    Response.json({
      success: true,
      data: {
        metadata: { url: "https://example.com/", title: "Fixture title" },
      },
    }),
  ).crawl(await target());
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.pages[0]?.markdown, null);
});

for (const [input, code] of [
  [undefined, "missing_credential"],
  ["", "missing_credential"],
  [null, "invalid_credential"],
  [123, "invalid_credential"],
  ["wrong", "invalid_credential"],
  ["fc-abc\n", "invalid_credential"],
  [" fc-abc", "invalid_credential"],
  ["fc-abc def", "invalid_credential"],
  ["fc-" + "a".repeat(300), "invalid_credential"],
] as const) {
  test(`credential validation rejects fixture ${String(input).slice(0, 12)}`, () => {
    assert.deepEqual(
      createFirecrawlCrawler({ env: { FIRECRAWL_API_KEY: input } }),
      { ok: false, code },
    );
  });
}

test("a public-prefixed credential cannot configure the adapter", () => {
  assert.deepEqual(
    createFirecrawlCrawler({
      env: { NEXT_PUBLIC_FIRECRAWL_API_KEY: credential },
    }),
    {
      ok: false,
      code: "missing_credential",
    },
  );
});

test("default adapter is closed to live calls even with a credential", async (t) => {
  t.mock.method(globalThis, "fetch", () =>
    assert.fail("live fetch must remain unavailable"),
  );
  assert.deepEqual(await crawler().crawl(await target()), {
    ok: false,
    code: "live_crawl_unavailable",
  });
});

test("raw, copied and forged targets cannot initiate a provider request", async () => {
  const validated = await target();
  let attempts = 0;
  const adapter = crawler(async () => {
    attempts++;
    return Response.json(document);
  });
  for (const input of [
    "https://example.com",
    null,
    { ...validated },
    {
      origin: "https://localhost",
      hostname: "localhost",
      addresses: ["1.1.1.1"],
    },
  ]) {
    const result: unknown = await Reflect.apply(adapter.crawl, adapter, [
      input,
    ]);
    assert.deepEqual(result, { ok: false, code: "invalid_target" });
  }
  assert.equal(attempts, 0);
});

for (const [status, code] of [
  [401, "unauthorized"],
  [403, "unauthorized"],
  [402, "quota_exceeded"],
  [429, "rate_limited"],
  [500, "provider_unavailable"],
  [503, "provider_unavailable"],
  [400, "provider_error"],
  [302, "provider_error"],
] as const) {
  test(`sanitizes HTTP ${status} without retrying or exposing its body`, async () => {
    let attempts = 0;
    const adapter = crawler(async () => {
      attempts++;
      return new Response(credential, { status });
    });
    assert.deepEqual(await adapter.crawl(await target()), { ok: false, code });
    assert.equal(attempts, 1);
  });
}

for (const data of [
  null,
  {},
  { markdown: " ", metadata: { sourceURL: "https://example.com/" } },
]) {
  test(`handles empty result ${JSON.stringify(data)}`, async () => {
    assert.deepEqual(
      await crawler(async () => Response.json({ success: true, data })).crawl(
        await target(),
      ),
      {
        ok: false,
        code: "empty_result",
      },
    );
  });
}

for (const payload of [
  null,
  [],
  { data: document.data },
  { success: "true", data: document.data },
  { success: true, data: [] },
  { success: true, data: { markdown: 123 } },
  { success: true, data: { markdown: "Fixture", metadata: { title: [] } } },
  {
    success: true,
    data: {
      ...document.data,
      metadata: { ...document.data.metadata, statusCode: "200" },
    },
  },
]) {
  test(`rejects malformed provider fixture ${JSON.stringify(payload).slice(0, 60)}`, async () => {
    assert.deepEqual(
      await crawler(async () => Response.json(payload)).crawl(await target()),
      {
        ok: false,
        code: "invalid_response",
      },
    );
  });
}

for (const url of [
  "https://localhost/",
  "http://example.com/",
  "https://evil.com/",
  "https://example.com:8443/",
  "https://user:pass@example.com/",
  "https://example.com\\@evil.com/",
  "not a url",
]) {
  test(`rejects unsafe or out-of-scope provider URL ${url}`, async () => {
    assert.deepEqual(
      await crawler(async () =>
        Response.json({
          ...document,
          data: {
            ...document.data,
            metadata: { ...document.data.metadata, url },
          },
        }),
      ).crawl(await target()),
      { ok: false, code: "invalid_response" },
    );
  });
}

test("provider-level errors and target HTTP failures never become successful pages", async () => {
  for (const payload of [
    { success: false, error: credential },
    {
      success: true,
      data: {
        ...document.data,
        metadata: { ...document.data.metadata, statusCode: 404 },
      },
    },
    {
      success: true,
      data: {
        ...document.data,
        metadata: { ...document.data.metadata, error: credential },
      },
    },
  ]) {
    const result = await crawler(async () => Response.json(payload)).crawl(
      await target(),
    );
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes(credential), false);
  }
});

test("malformed JSON and echoed credentials fail without exposing content", async () => {
  for (const response of [
    new Response("{"),
    Response.json({
      ...document,
      data: { ...document.data, markdown: credential },
    }),
  ]) {
    assert.deepEqual(
      await crawler(async () => response).crawl(await target()),
      { ok: false, code: "invalid_response" },
    );
  }
});

test("oversized streams are cancelled before accepting content", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  assert.deepEqual(
    await crawler(async () => new Response(stream)).crawl(await target()),
    {
      ok: false,
      code: "response_too_large",
    },
  );
  assert.equal(cancelled, true);
});

test("network errors are sanitized", async () => {
  assert.deepEqual(
    await crawler(async () => {
      throw new Error(credential);
    }).crawl(await target()),
    {
      ok: false,
      code: "network_error",
    },
  );
});

test("caller cancellation aborts the exchange and releases the busy guard", async () => {
  const validated = await target();
  const controller = new AbortController();
  let exchangeSignal: AbortSignal | undefined;
  const adapter = crawler(async ({ init }) => {
    exchangeSignal = init.signal;
    return new Promise<Response>(() => {});
  });
  const pending = adapter.crawl(validated, controller.signal);
  assert.deepEqual(await adapter.crawl(validated), { ok: false, code: "busy" });
  controller.abort();
  assert.deepEqual(await pending, { ok: false, code: "cancelled" });
  assert.equal(exchangeSignal?.aborted, true);
  assert.deepEqual(await adapter.crawl(validated, AbortSignal.abort()), {
    ok: false,
    code: "cancelled",
  });
});

test("a stalled response body is bounded by the total deadline", async (t) => {
  const validated = await target();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const pending = crawler(async () => response).crawl(validated);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(20000);
  assert.deepEqual(await pending, { ok: false, code: "timeout" });
  assert.equal(cancelled, true);
});

test("a stalled exchange is bounded even when it ignores cancellation", async (t) => {
  const validated = await target();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  const pending = crawler(async (request) => {
    signal = request.init.signal;
    return new Promise<Response>(() => {});
  }).crawl(validated);
  t.mock.timers.tick(20000);
  assert.deepEqual(await pending, { ok: false, code: "timeout" });
  assert.equal(signal?.aborted, true);
});

test("an oversized declared body is rejected and cancelled without reading", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    {
      headers: { "content-length": String(2 * 1024 * 1024 + 1) },
    },
  );
  assert.deepEqual(await crawler(async () => response).crawl(await target()), {
    ok: false,
    code: "response_too_large",
  });
  assert.equal(cancelled, true);
});

test("unsafe sourceURL is rejected even when the final URL looks safe", async () => {
  const response = Response.json({
    ...document,
    data: {
      ...document.data,
      metadata: { ...document.data.metadata, sourceURL: "https://127.0.0.1/" },
    },
  });
  assert.deepEqual(await crawler(async () => response).crawl(await target()), {
    ok: false,
    code: "invalid_response",
  });
});

test("credential-bearing module cannot load under the default client condition", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "await import('./src/infrastructure/firecrawl.ts')",
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
