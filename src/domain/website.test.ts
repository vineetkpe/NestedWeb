import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeWebsite } from "./website.ts";

// Fixtures only: these tests never resolve or visit the named websites.
const valid: ReadonlyArray<readonly [string, string]> = [
  ["example.com", "example.com"],
  ["https://example.com", "example.com"],
  ["www.example.com", "www.example.com"],
  ["http://www.example.com/", "www.example.com"],
  ["  HTTPS://ExAmPlE.com/path?q=value#part  ", "example.com"],
  ["example.com./", "example.com"],
  ["https://example.com:443/", "example.com"],
  ["http://example.com:80/", "example.com"],
  ["example.com:443", "example.com"],
  ["sub-domain.example.co.uk/path", "sub-domain.example.co.uk"],
  ["https://bücher.de/", "xn--bcher-kva.de"],
  ["https://例え.テスト/", "xn--r8jz45g.xn--zckzah"],
  ["example.com/a%20b", "example.com"],
  ["https://example.com/?next=http://127.0.0.1", "example.com"],
];

for (const [input, hostname] of valid) {
  test(`normalizes website ${JSON.stringify(input)}`, () => {
    const result = normalizeWebsite(input);
    assert.deepEqual(result, {
      ok: true,
      value: { origin: `https://${hostname}`, hostname },
    });
    assert.deepEqual(normalizeWebsite(`https://${hostname}`), result);
  });
}

const invalid: readonly unknown[] = [
  null,
  undefined,
  42,
  {},
  [],
  new URL("https://example.com"),
  "",
  "   ",
  "a".repeat(2049),
  "localhost",
  "localhost.",
  "https://LOCALHOST./",
  "foo.localhost",
  "printer.local",
  "server.internal",
  "metadata.google.internal",
  "router.lan",
  "service.localdomain",
  "company.corp",
  "company.home",
  "company.intranet",
  "home.arpa",
  "a.test",
  "a.invalid",
  "a.example",
  "site.onion",
  "service.alt",
  "intranet",
  "https://com",
  "127.0.0.1",
  "127.1",
  "2130706433",
  "0177.0.0.1",
  "0x7f000001",
  "0x7f.0.0.1",
  "https://127.0.0.1.nip.io:8080",
  "10.0.0.1",
  "172.16.0.1",
  "192.168.1.1",
  "169.254.169.254",
  "100.100.100.200",
  "0.0.0.0",
  "255.255.255.255",
  "8.8.8.8",
  "https://[::1]",
  "https://[::ffff:127.0.0.1]",
  "https://[fc00::1]",
  "https://[fe80::1%25eth0]",
  "https://[2606:4700:4700::1111]",
  "http://user:secret@example.com",
  "https://user@example.com",
  "https://@example.com",
  "example.com@evil.com",
  "https://example.com:8443",
  "http://example.com:443",
  "https://example.com:80",
  "example.com:0",
  "example.com:65536",
  "https://example.com:",
  "https://example.com:0443",
  "ftp://example.com",
  "file:///etc/passwd",
  "javascript:alert(1)",
  "data:text/plain,example.com",
  "mailto:a@example.com",
  "gopher://example.com",
  "ws://example.com",
  "//example.com",
  "/example.com",
  "https:example.com",
  "https:/example.com",
  "https:///example.com",
  "https:////example.com",
  "https://",
  "https://example.com\\@127.0.0.1",
  "https://example.com\n.evil.com",
  "\thttps://example.com",
  "https://example.com\u0000",
  "https://exam ple.com",
  "https://exam\u200bple.com",
  "https://example.com/%0d%0aHost:x",
  "https://%65xample.com",
  "https://%31%32%37.0.0.1",
  "https://example.com/%zz",
  "https://-bad.com",
  "https://bad-.com",
  "https://a..com",
  "https://example.com..",
  "https://a_b.com",
  "https://*.example.com",
  "https://example.123",
  `https://${"a".repeat(64)}.com`,
  `https://${("a".repeat(63) + ".").repeat(4)}com`,
  "[https://example.com](https://example.com)",
];

for (const [index, input] of invalid.entries()) {
  test(`rejects unsafe or malformed website fixture ${index + 1}`, () => {
    const result = normalizeWebsite(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.equal("value" in result, false);
  });
}

test("credential rejection never returns the submitted secret", () => {
  const result = normalizeWebsite("https://user:secret@example.com");
  assert.deepEqual(result, { ok: false, code: "credentials_not_allowed" });
});
