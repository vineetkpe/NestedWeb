import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareWebsiteTarget } from "./website-target.ts";

test("returns a canonical origin and every checked address, deduplicated", async () => {
  const result = await prepareWebsiteTarget(
    "http://EXAMPLE.com/path",
    async (hostname) => {
      assert.equal(hostname, "example.com");
      return ["1.1.1.1", "2606:4700:4700::1111", "1.1.1.1"];
    },
  );
  assert.deepEqual(result, {
    ok: true,
    value: {
      origin: "https://example.com",
      hostname: "example.com",
      addresses: ["1.1.1.1", "2606:4700:4700::1111"],
    },
  });
});

test("invalid input cannot initiate DNS work", async () => {
  let queried = false;
  const result = await prepareWebsiteTarget("localhost", async () => {
    queried = true;
    return ["1.1.1.1"];
  });
  assert.equal(result.ok, false);
  assert.equal(queried, false);
});

for (const addresses of [
  ["127.0.0.1"],
  ["10.0.0.1"],
  ["1.1.1.1", "192.168.0.1"],
  ["1.1.1.1", "::1"],
  ["2606:4700:4700::1111", "fd00::1"],
  ["168.63.129.16"],
  ["::ffff:169.254.169.254"],
]) {
  test(`rejects DNS response containing ${addresses.at(-1)}`, async () => {
    assert.deepEqual(
      await prepareWebsiteTarget("example.com", async () => addresses),
      {
        ok: false,
        code: "unsafe_address",
      },
    );
  });
}

for (const response of [
  null,
  {},
  "1.1.1.1",
  [],
  new Array(2),
  Array(65).fill("1.1.1.1"),
  ["1.1.1.1", null],
  [{ address: "1.1.1.1" }],
]) {
  test(`rejects malformed or oversized DNS data ${JSON.stringify(response)}`, async () => {
    const result = await prepareWebsiteTarget(
      "example.com",
      async () => response,
    );
    assert.equal(result.ok, false);
    assert.equal("value" in result, false);
  });
}

test("resolver failure is sanitized", async () => {
  assert.deepEqual(
    await prepareWebsiteTarget("example.com", async () => {
      throw new Error("sensitive resolver details");
    }),
    { ok: false, code: "dns_failed" },
  );
});

test("synchronous cancellation plus resolver failure has no unhandled rejection", async () => {
  const controller = new AbortController();
  const result = await prepareWebsiteTarget(
    "example.com",
    () => {
      controller.abort();
      throw new Error("sensitive synchronous failure");
    },
    controller.signal,
  );
  assert.deepEqual(result, { ok: false, code: "cancelled" });
});

test("a later resolution to a private address is rejected without a cached permit", async () => {
  let calls = 0;
  const resolve = async () => (++calls === 1 ? ["1.1.1.1"] : ["127.0.0.1"]);
  assert.equal((await prepareWebsiteTarget("example.com", resolve)).ok, true);
  assert.deepEqual(await prepareWebsiteTarget("example.com", resolve), {
    ok: false,
    code: "unsafe_address",
  });
});

test("pre-cancelled input does not resolve", async () => {
  const result = await prepareWebsiteTarget(
    "example.com",
    async () => {
      assert.fail("must not resolve after cancellation");
    },
    AbortSignal.abort(),
  );
  assert.deepEqual(result, { ok: false, code: "cancelled" });
});

test("cancellation returns promptly and aborts pending DNS work", async () => {
  const controller = new AbortController();
  let stopped = false;
  const pending = prepareWebsiteTarget(
    "example.com",
    async (_hostname, signal) => {
      signal.addEventListener(
        "abort",
        () => {
          stopped = true;
        },
        { once: true },
      );
      return new Promise<unknown>(() => {});
    },
    controller.signal,
  );
  controller.abort();
  assert.deepEqual(await pending, { ok: false, code: "cancelled" });
  assert.equal(stopped, true);
});

test("deadline fails closed even when the resolver ignores cancellation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let dnsSignal: AbortSignal | undefined;
  const pending = prepareWebsiteTarget(
    "example.com",
    async (_hostname, signal) => {
      dnsSignal = signal;
      return new Promise<unknown>(() => {});
    },
  );
  t.mock.timers.tick(3000);
  assert.deepEqual(await pending, { ok: false, code: "dns_timeout" });
  assert.equal(dnsSignal?.aborted, true);
});

test("screening results cannot be mutated before a crawler consumes them", async () => {
  const result = await prepareWebsiteTarget("example.com", async () => [
    "1.1.1.1",
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.addresses), true);
  assert.throws(
    () => Object.assign(result.value, { origin: "https://localhost" }),
    TypeError,
  );
  assert.throws(
    () => Object.assign(result.value.addresses, { 0: "127.0.0.1" }),
    TypeError,
  );
});
