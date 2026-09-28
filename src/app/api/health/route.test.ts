import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route.ts";

test("GET /api/health returns 200 with structured status and no-cache headers", async () => {
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
  assert.ok(typeof body.services === "object" && body.services !== null);

  // Security guarantee: zero secrets leaked in payload
  const raw = JSON.stringify(body);
  assert.equal(raw.includes("sb_secret"), false);
  assert.equal(raw.includes("AIzaSy"), false);
});
