import assert from "node:assert/strict";
import test from "node:test";

import { runConfiguredScanWorkerOnce } from "./scan-worker-server.ts";

const validBase = Object.freeze({
  NESTEDWEB_LIVE_SCAN_WORKER_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_abcdefghijklmnopqrstuvwxyz012345",
  GEMINI_API_KEY: "abcdefghijklmnopqrstuvwxyz012345",
  NESTEDWEB_SCAN_WORKER_ID: "11111111-1111-4111-8111-111111111111",
  NESTEDWEB_SCAN_LEASE_SECONDS: "60",
});

test("configured live worker is disabled by default before any backend client is created", async () => {
  const result = await runConfiguredScanWorkerOnce({ env: {} });
  assert.deepEqual(result, {
    ok: false,
    stage: "server_setup",
    code: "live_execution_disabled",
  });
});

test("configured live worker rejects missing and malformed secrets before claiming work", async () => {
  const cases: Array<readonly [Record<string, unknown>, string]> = [
    [{ NESTEDWEB_LIVE_SCAN_WORKER_ENABLED: "true" }, "missing_supabase_url"],
    [
      { ...validBase, SUPABASE_URL: "http://example.com" },
      "invalid_supabase_url",
    ],
    [
      { ...validBase, SUPABASE_SECRET_KEY: "legacy-or-public-key" },
      "invalid_supabase_secret_key",
    ],
    [{ ...validBase, GEMINI_API_KEY: "short" }, "invalid_gemini_credential"],
    [
      { ...validBase, NESTEDWEB_SCAN_WORKER_ID: "not-a-uuid" },
      "invalid_worker_id",
    ],
    [
      { ...validBase, NESTEDWEB_SCAN_LEASE_SECONDS: "20" },
      "invalid_lease_seconds",
    ],
  ];

  for (const [env, code] of cases) {
    const result = await runConfiguredScanWorkerOnce({ env });
    assert.deepEqual(result, { ok: false, stage: "server_setup", code });
  }
});

test("live execution must be enabled by the exact true value", async () => {
  for (const value of [undefined, "false", "TRUE", "1", true]) {
    const env: Record<string, unknown> = { ...validBase };
    if (value === undefined) delete env.NESTEDWEB_LIVE_SCAN_WORKER_ENABLED;
    else env.NESTEDWEB_LIVE_SCAN_WORKER_ENABLED = value;

    const result = await runConfiguredScanWorkerOnce({ env });
    assert.deepEqual(result, {
      ok: false,
      stage: "server_setup",
      code: "live_execution_disabled",
    });
  }
});
