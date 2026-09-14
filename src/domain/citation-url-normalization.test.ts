import assert from "node:assert/strict";
import test from "node:test";

import {
  CITATION_URL_NORMALIZATION_VERSION,
  normalizeCitationUrl,
} from "./citation-url-normalization.ts";

test("canonicalizes only URL syntax while preserving query order and fragment", () => {
  assert.deepEqual(
    normalizeCitationUrl(
      "HTTPS://BÜCHER.Example:443/a?utm_source=x&b=2&a=1#section",
    ),
    {
      methodVersion: CITATION_URL_NORMALIZATION_VERSION,
      state: "normalized",
      canonicalUrl:
        "https://xn--bcher-kva.example/a?utm_source=x&b=2&a=1#section",
      canonicalDomain: "xn--bcher-kva.example",
      exclusionReason: null,
    },
  );

  assert.deepEqual(normalizeCitationUrl("http://EXAMPLE.com:80"), {
    methodVersion: CITATION_URL_NORMALIZATION_VERSION,
    state: "normalized",
    canonicalUrl: "http://example.com/",
    canonicalDomain: "example.com",
    exclusionReason: null,
  });
});

test("keeps the full hostname and does not infer a registrable domain", () => {
  const result = normalizeCitationUrl(
    "https://www.news.example.co.uk/path?b=2&a=1#source",
  );

  assert.deepEqual(result, {
    methodVersion: CITATION_URL_NORMALIZATION_VERSION,
    state: "normalized",
    canonicalUrl: "https://www.news.example.co.uk/path?b=2&a=1#source",
    canonicalDomain: "www.news.example.co.uk",
    exclusionReason: null,
  });
});

test("rejects unsupported schemes without treating them as HTTP citations", () => {
  for (const value of [
    "ftp://example.com/file",
    "mailto:source@example.com",
    "data:text/plain,source",
  ]) {
    assert.deepEqual(normalizeCitationUrl(value), {
      methodVersion: CITATION_URL_NORMALIZATION_VERSION,
      state: "excluded",
      canonicalUrl: null,
      canonicalDomain: null,
      exclusionReason: "unsupported_scheme",
    });
  }
});

test("rejects credentials, authority ambiguity, backslashes and literal control or whitespace characters", () => {
  for (const value of [
    "https://user:password@example.com/path",
    "https://@example.com/path",
    "https://example.com\\@evil.example/path",
    "https://example.com/a b",
    "https://example.com/path\nnext",
  ]) {
    assert.deepEqual(normalizeCitationUrl(value), {
      methodVersion: CITATION_URL_NORMALIZATION_VERSION,
      state: "excluded",
      canonicalUrl: null,
      canonicalDomain: null,
      exclusionReason: "unsafe_url",
    });
  }
});

test("rejects malformed, relative and oversized values explicitly", () => {
  for (const value of [
    "example.com/path",
    "https://[::1",
    " https://example.com/",
    `https://example.com/${"a".repeat(8192)}`,
  ]) {
    assert.deepEqual(normalizeCitationUrl(value), {
      methodVersion: CITATION_URL_NORMALIZATION_VERSION,
      state: "excluded",
      canonicalUrl: null,
      canonicalDomain: null,
      exclusionReason: "invalid_url",
    });
  }
});

test("is stateless and does not deduplicate equal citation URLs", () => {
  const first = normalizeCitationUrl("https://example.com/source?id=1");
  const second = normalizeCitationUrl("https://example.com/source?id=1");

  assert.deepEqual(first, second);
  assert.notStrictEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(second), true);
});
