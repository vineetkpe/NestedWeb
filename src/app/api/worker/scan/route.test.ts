import assert from "node:assert/strict";
import test from "node:test";

import { GET, POST, isWorkerAuthorized } from "./route.ts";

test("isWorkerAuthorized: rejects when CRON_SECRET is undefined or empty", () => {
  const req = new Request("http://localhost:3000/api/worker/scan", {
    headers: { authorization: "Bearer some-token" },
  });
  assert.equal(isWorkerAuthorized(req, undefined), false);
  assert.equal(isWorkerAuthorized(req, ""), false);
  assert.equal(isWorkerAuthorized(req, "   "), false);
});

test("isWorkerAuthorized: rejects when authorization header is missing or invalid", () => {
  const secret = "test-cron-secret-1234567890";
  const noAuthReq = new Request("http://localhost:3000/api/worker/scan");
  assert.equal(isWorkerAuthorized(noAuthReq, secret), false);

  const wrongBearerReq = new Request("http://localhost:3000/api/worker/scan", {
    headers: { authorization: "Bearer wrong-secret" },
  });
  assert.equal(isWorkerAuthorized(wrongBearerReq, secret), false);

  const basicAuthReq = new Request("http://localhost:3000/api/worker/scan", {
    headers: { authorization: "Basic dXNlcjpwYXNz" },
  });
  assert.equal(isWorkerAuthorized(basicAuthReq, secret), false);
});

test("isWorkerAuthorized: accepts valid Bearer token and x-cron-secret", () => {
  const secret = "test-cron-secret-1234567890";

  const bearerReq = new Request("http://localhost:3000/api/worker/scan", {
    headers: { authorization: `Bearer ${secret}` },
  });
  assert.equal(isWorkerAuthorized(bearerReq, secret), true);

  const headerReq = new Request("http://localhost:3000/api/worker/scan", {
    headers: { "x-cron-secret": secret },
  });
  assert.equal(isWorkerAuthorized(headerReq, secret), true);
});

test("GET /api/worker/scan returns 401 when unauthorized", async () => {
  const req = new Request("http://localhost:3000/api/worker/scan");
  const response = await GET(req);

  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("Cache-Control"),
    "no-store, no-cache, must-revalidate",
  );

  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
  assert.equal(body.error, "Unauthorized");

  // Zero secrets leaked
  const raw = JSON.stringify(body);
  assert.equal(raw.includes("sb_secret_"), false);
  assert.equal(raw.includes("AIzaSy"), false);
});

test("POST /api/worker/scan returns 401 when unauthorized", async () => {
  const req = new Request("http://localhost:3000/api/worker/scan", {
    method: "POST",
  });
  const response = await POST(req);

  assert.equal(response.status, 401);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
});

test("GET /api/worker/scan returns safe execution status when authorized", async () => {
  const prevSecret = process.env.CRON_SECRET;
  const testSecret = "test-cron-secret-abcdef123456";
  process.env.CRON_SECRET = testSecret;

  try {
    const req = new Request("http://localhost:3000/api/worker/scan", {
      headers: { authorization: `Bearer ${testSecret}` },
    });
    const response = await GET(req);

    // Depending on whether live worker is enabled, response status will be 200 (disabled/idle)
    assert.ok(response.status === 200 || response.status === 500);

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(typeof body.durationMs, "number");

    // Zero secrets leaked
    const raw = JSON.stringify(body);
    assert.equal(raw.includes("sb_secret_"), false);
    assert.equal(raw.includes("AIzaSy"), false);
    assert.equal(raw.includes(testSecret), false);
  } finally {
    if (prevSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = prevSecret;
    }
  }
});
