import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route.ts";

test("GET /api/health returns healthy JSON diagnostics and no leaked secrets", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("Cache-Control"),
    "no-store, no-cache, must-revalidate",
  );

  const body = (await response.json()) as Record<string, unknown>;
  assert.ok(body.status === "healthy" || body.status === "degraded");
  assert.equal(typeof body.timestamp, "string");
  assert.equal(typeof body.uptimeSeconds, "number");
  assert.equal(typeof body.version, "string");
  assert.ok(body.services && typeof body.services === "object");

  // Ensure absolutely no secrets or credentials leaked in response
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("sb_secret_"), false);
  assert.equal(serialized.includes("AIzaSy"), false);
  assert.equal(serialized.includes("password"), false);
});
