import assert from "node:assert/strict";
import { Resolver } from "node:dns/promises";
import { test } from "node:test";
import { prepareWebsiteTarget } from "../application/website-target.ts";
import { resolveWebsiteAddresses } from "./website-dns.ts";

// Replace only external DNS methods. Orchestration and address checks stay real.
test("native adapter includes both A and AAAA answers in screening", async (t) => {
  t.mock.method(Resolver.prototype, "resolve4", async (hostname: string) => {
    assert.equal(hostname, "example.com.");
    return ["1.1.1.1"];
  });
  t.mock.method(Resolver.prototype, "resolve6", async () => ["::1"]);
  assert.deepEqual(
    await prepareWebsiteTarget("example.com", resolveWebsiteAddresses),
    {
      ok: false,
      code: "unsafe_address",
    },
  );
});

test("an absent record family still permits checked addresses in the other family", async (t) => {
  t.mock.method(Resolver.prototype, "resolve4", async () => ["1.1.1.1"]);
  t.mock.method(Resolver.prototype, "resolve6", async () => {
    throw Object.assign(new Error("no AAAA"), { code: "ENODATA" });
  });
  const result = await prepareWebsiteTarget(
    "example.com",
    resolveWebsiteAddresses,
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.addresses, ["1.1.1.1"]);
});

for (const code of ["ETIMEOUT", "ESERVFAIL", "ENOTFOUND", "ECONNREFUSED"]) {
  test(`fails closed when one DNS family fails with ${code}`, async (t) => {
    t.mock.method(Resolver.prototype, "resolve4", async () => ["1.1.1.1"]);
    t.mock.method(Resolver.prototype, "resolve6", async () => {
      throw Object.assign(new Error("private diagnostic"), { code });
    });
    assert.deepEqual(
      await prepareWebsiteTarget("example.com", resolveWebsiteAddresses),
      {
        ok: false,
        code: "dns_failed",
      },
    );
  });
}

test("cancels the native resolver when its caller aborts", async (t) => {
  let cancelled = false;
  t.mock.method(
    Resolver.prototype,
    "resolve4",
    () => new Promise<unknown>(() => {}),
  );
  t.mock.method(
    Resolver.prototype,
    "resolve6",
    () => new Promise<unknown>(() => {}),
  );
  t.mock.method(Resolver.prototype, "cancel", () => {
    cancelled = true;
  });
  const controller = new AbortController();
  const pending = prepareWebsiteTarget(
    "example.com",
    resolveWebsiteAddresses,
    controller.signal,
  );
  controller.abort();
  assert.deepEqual(await pending, { ok: false, code: "cancelled" });
  assert.equal(cancelled, true);
});
