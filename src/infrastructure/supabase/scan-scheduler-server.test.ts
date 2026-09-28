import test from "node:test";
import assert from "node:assert/strict";

import {
  parseSchedulerServerConfig,
  runConfiguredScanSchedulerOnce,
  type SchedulerServerConfig,
} from "./scan-scheduler-server.ts";

test("infrastructure: scan-scheduler-server parseSchedulerServerConfig validates environment", () => {
  const validEnv = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_abcdef1234567890abcdef123456",
  };

  const config = parseSchedulerServerConfig(validEnv);
  assert.equal("stage" in config, false);
  const validConfig = config as SchedulerServerConfig;
  assert.equal(validConfig.supabaseUrl, "https://example.supabase.co");
  assert.equal(
    validConfig.supabaseSecretKey,
    "sb_secret_abcdef1234567890abcdef123456",
  );

  // Missing URL
  const missingUrl = parseSchedulerServerConfig({
    SUPABASE_SECRET_KEY: validEnv.SUPABASE_SECRET_KEY,
  });
  assert.equal("stage" in missingUrl, true);
  if ("stage" in missingUrl) {
    assert.equal(missingUrl.code, "missing_supabase_url");
  }

  // Missing secret key
  const missingKey = parseSchedulerServerConfig({
    NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL,
  });
  assert.equal("stage" in missingKey, true);
  if ("stage" in missingKey) {
    assert.equal(missingKey.code, "missing_supabase_secret_key");
  }
});

test("infrastructure: scan-scheduler-server returns setup failure when env is incomplete", async () => {
  const result = await runConfiguredScanSchedulerOnce({ env: {} });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.stage, "server_setup");
  }
});
