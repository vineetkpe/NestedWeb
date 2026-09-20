import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requireSupabasePublicConfig,
  SupabaseConfigurationError,
} from "./supabase/config.ts";

test("accepts a canonical HTTPS Supabase origin and snapshots configuration", () => {
  const result = requireSupabasePublicConfig({
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
  });

  assert.deepEqual(result, {
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
  });
  assert.equal(Object.isFrozen(result), true);
});

test("allows local HTTP origins for Supabase development", () => {
  assert.deepEqual(
    requireSupabasePublicConfig({
      url: "http://127.0.0.1:54321",
      publishableKey: "local-key",
    }),
    {
      url: "http://127.0.0.1:54321",
      publishableKey: "local-key",
    },
  );
});

test("rejects missing, partial, malformed, or unsafe Supabase configuration", () => {
  const invalid = [
    { url: undefined, publishableKey: undefined },
    { url: "https://example.supabase.co", publishableKey: "" },
    { url: "", publishableKey: "key" },
    { url: "not-a-url", publishableKey: "key" },
    { url: "http://example.supabase.co", publishableKey: "key" },
    { url: "https://user@example.supabase.co", publishableKey: "key" },
    { url: "https://example.supabase.co/path", publishableKey: "key" },
    { url: "https://example.supabase.co?x=1", publishableKey: "key" },
    { url: "https://example.supabase.co#fragment", publishableKey: "key" },
  ];

  for (const input of invalid) {
    assert.throws(
      () => requireSupabasePublicConfig(input),
      SupabaseConfigurationError,
    );
  }
});

test("trims environment-style values but rejects unusable publishable keys", () => {
  assert.deepEqual(
    requireSupabasePublicConfig({
      url: "  https://example.supabase.co  ",
      publishableKey: "  sb_publishable_test  ",
    }),
    {
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    },
  );

  assert.throws(
    () =>
      requireSupabasePublicConfig({
        url: "https://example.supabase.co",
        publishableKey: "x".repeat(4097),
      }),
    SupabaseConfigurationError,
  );
});
