import { isIP } from "node:net";

export type WebsiteErrorCode =
  | "invalid_input"
  | "invalid_url"
  | "unsupported_protocol"
  | "credentials_not_allowed"
  | "port_not_allowed"
  | "host_not_allowed";

export type Website = Readonly<{ origin: string; hostname: string }>;
export type WebsiteResult =
  { ok: true; value: Website } | { ok: false; code: WebsiteErrorCode };

const internalSuffixes = new Set([
  "localhost",
  "local",
  "localdomain",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "arpa",
  "invalid",
  "test",
  "example",
  "onion",
  "alt",
]);

/** Pure intake normalization. Success does not authorize network access. */
export function normalizeWebsite(input: unknown): WebsiteResult {
  if (typeof input !== "string" || input.length > 2048) {
    return { ok: false, code: "invalid_input" };
  }
  const value = input.trim();
  if (!value || /[\p{Cc}\p{Cf}]/u.test(input)) {
    return { ok: false, code: "invalid_input" };
  }
  // WHATWG parsing repairs some ambiguous inputs; reject them before parsing.
  if (
    /[\s\\]/u.test(value) ||
    /%(?![\da-f]{2})|%(?:0[\da-f]|1[\da-f]|7f)/i.test(value)
  ) {
    return { ok: false, code: "invalid_url" };
  }

  const hasHttpScheme = /^https?:\/\//i.test(value);
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  const bareHostPort = /^[^/:?#]+:\d+(?:[/?#]|$)/.test(value);
  if (!hasHttpScheme && hasScheme && !bareHostPort) {
    return { ok: false, code: "unsupported_protocol" };
  }
  const candidate = hasHttpScheme ? value : `https://${value}`;
  const authority = candidate
    .slice(candidate.indexOf("://") + 3)
    .split(/[/?#]/)[0];
  if (!authority || authority.includes("%")) {
    return { ok: false, code: "invalid_url" };
  }
  if (authority.includes("@")) {
    return { ok: false, code: "credentials_not_allowed" };
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, code: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, code: "unsupported_protocol" };
  }
  if (url.username || url.password) {
    return { ok: false, code: "credentials_not_allowed" };
  }
  const hostname = url.hostname.replace(/\.$/, "");
  if (hostname.startsWith("[") || isIP(hostname) !== 0) {
    return { ok: false, code: "host_not_allowed" };
  }
  // Inspect the original authority because URL removes explicit default ports.
  const colon = authority.lastIndexOf(":");
  if (
    colon !== -1 &&
    authority.slice(colon + 1) !== (url.protocol === "http:" ? "80" : "443")
  ) {
    return { ok: false, code: "port_not_allowed" };
  }
  const labels = hostname.split(".");
  const suffix = labels.at(-1);
  if (
    hostname.length > 253 ||
    labels.length < 2 ||
    !suffix ||
    internalSuffixes.has(suffix) ||
    !/^[a-z][a-z\d-]*$/.test(suffix) ||
    labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label))
  ) {
    return { ok: false, code: "host_not_allowed" };
  }
  return { ok: true, value: { origin: `https://${hostname}`, hostname } };
}
