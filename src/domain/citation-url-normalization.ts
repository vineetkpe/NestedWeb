export const CITATION_URL_NORMALIZATION_VERSION = "citation-url-v1" as const;

const MAX_CITATION_URL_LENGTH = 8192;
const FORBIDDEN_LITERAL_CHARACTERS = /[\\<>\s\p{Cc}\p{Cf}]/u;
const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;

export type CitationUrlExclusionReason =
  | "invalid_url"
  | "unsupported_scheme"
  | "unsafe_url";

export type CitationUrlNormalizationResult =
  | Readonly<{
      methodVersion: typeof CITATION_URL_NORMALIZATION_VERSION;
      state: "normalized";
      canonicalUrl: string;
      canonicalDomain: string;
      exclusionReason: null;
    }>
  | Readonly<{
      methodVersion: typeof CITATION_URL_NORMALIZATION_VERSION;
      state: "excluded";
      canonicalUrl: null;
      canonicalDomain: null;
      exclusionReason: CitationUrlExclusionReason;
    }>;

function excluded(
  exclusionReason: CitationUrlExclusionReason,
): CitationUrlNormalizationResult {
  return Object.freeze({
    methodVersion: CITATION_URL_NORMALIZATION_VERSION,
    state: "excluded" as const,
    canonicalUrl: null,
    canonicalDomain: null,
    exclusionReason,
  });
}

function authority(value: string): string | null {
  const separator = value.indexOf("://");
  if (separator < 0) return null;
  const start = separator + 3;
  const rest = value.slice(start);
  const end = rest.search(/[/?#]/u);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * Deterministic citation syntax normalization only. This method performs no
 * network access, ownership check, public-suffix inference, deduplication, or
 * claim/support inference. The immutable raw citation remains the source record.
 */
export function normalizeCitationUrl(
  value: string,
): CitationUrlNormalizationResult {
  if (
    value.length === 0 ||
    value.length > MAX_CITATION_URL_LENGTH ||
    value !== value.trim()
  )
    return excluded("invalid_url");

  if (FORBIDDEN_LITERAL_CHARACTERS.test(value)) return excluded("unsafe_url");

  if (!SCHEME_PATTERN.test(value)) return excluded("invalid_url");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return excluded("invalid_url");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:")
    return excluded("unsupported_scheme");

  const rawAuthority = authority(value);
  if (
    rawAuthority === null ||
    rawAuthority.includes("@") ||
    url.username !== "" ||
    url.password !== ""
  )
    return excluded("unsafe_url");

  if (url.hostname === "") return excluded("invalid_url");

  const canonicalUrl = url.toString();
  if (canonicalUrl.length > MAX_CITATION_URL_LENGTH)
    return excluded("invalid_url");

  return Object.freeze({
    methodVersion: CITATION_URL_NORMALIZATION_VERSION,
    state: "normalized" as const,
    canonicalUrl,
    canonicalDomain: url.hostname,
    exclusionReason: null,
  });
}
