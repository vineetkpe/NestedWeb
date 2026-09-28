import assert from "node:assert/strict";
import test from "node:test";

import { GET, POST, isSchedulerAuthorized } from "./route.ts";

test("isSchedulerAuthorized: rejects when CRON_SECRET is undefined or empty", () => {
  const req = new Request("http://localhost:3000/api/worker/scheduler", {
    headers: { authorization: "Bearer some-token" },
  });
  assert.equal(isSchedulerAuthorized(req, undefined), false);
  assert.equal(isSchedulerAuthorized(req, ""), false);
  assert.equal(isSchedulerAuthorized(req, "   "), false);
});

test("isSchedulerAuthorized: rejects when authorization header is missing or invalid", () => {
  const secret = "test-cron-secret-1234567890";
  const noAuthReq = new Request("http://localhost:3000/api/worker/scheduler");
  assert.equal(isSchedulerAuthorized(noAuthReq, secret), false);

  const wrongBearerReq = new Request(
    "http://localhost:3000/api/worker/scheduler",
    {
      headers: { authorization: "Bearer wrong-secret" },
    },
  );
  assert.equal(isSchedulerAuthorized(wrongBearerReq, secret), false);
});

test("isSchedulerAuthorized: accepts valid Bearer token and x-cron-secret", () => {
  const secret = "test-cron-secret-1234567890";

  const bearerReq = new Request("http://localhost:3000/api/worker/scheduler", {
    headers: { authorization: `Bearer ${secret}` },
  });
  assert.equal(isSchedulerAuthorized(bearerReq, secret), true);

  const headerReq = new Request("http://localhost:3000/api/worker/scheduler", {
    headers: { "x-cron-secret": secret },
  });
  assert.equal(isSchedulerAuthorized(headerReq, secret), true);
});

test("GET /api/worker/scheduler returns 401 when unauthorized", async () => {
  const req = new Request("http://localhost:3000/api/worker/scheduler");
  const response = await GET(req);

  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("Cache-Control"),
    "no-store, no-cache, must-revalidate",
  );

  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
  assert.equal(body.error, "Unauthorized");
});

test("POST /api/worker/scheduler returns 401 when unauthorized", async () => {
  const req = new Request("http://localhost:3000/api/worker/scheduler", {
    method: "POST",
  });
  const response = await POST(req);

  assert.equal(response.status, 401);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
});
