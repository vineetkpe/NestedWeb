import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";

import { GET } from "./route.ts";

test("redirects to login when code is missing", async () => {
  const request = new NextRequest("http://localhost:3000/auth/callback");
  const response = await GET(request);

  assert.equal(response.status, 307);
  const location = response.headers.get("location");
  assert.ok(location?.includes("/login?error=invalid_auth_request"));
});

test("enforces safe redirect path on failed code exchange", async () => {
  const request = new NextRequest(
    "http://localhost:3000/auth/callback?code=bad_code&next=//attacker.com",
  );
  const response = await GET(request);

  assert.equal(response.status, 307);
  const location = response.headers.get("location");
  // Should never redirect to attacker.com
  assert.ok(!location?.includes("attacker.com"));
});
