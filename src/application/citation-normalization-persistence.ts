import {
  CITATION_URL_NORMALIZATION_VERSION,
  normalizeCitationUrl,
  type CitationUrlNormalizationResult,
} from "../domain/citation-url-normalization.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CITATION_COUNT = 50;
const MAX_CITATION_ID_LENGTH = 256;
const MAX_CITATION_URL_LENGTH = 8192;

export type PersistedCitationOccurrence = Readonly<{
  citationOrdinal: number;
  citationId: string;
  citedUrl: string;
}>;

export type CitationNormalizationReadGatewayResult =
  | Readonly<{
      ok: true;
      citations: ReadonlyArray<PersistedCitationOccurrence>;
    }>
  | Readonly<{
      ok: false;
      code:
        | "observation_not_found"
        | "database_error"
        | "invalid_database_response";
    }>;

export type CitationNormalizationReadGateway = (
  workspaceId: string,
  observationId: string,
) => Promise<CitationNormalizationReadGatewayResult>;

export type CitationNormalizationPersistenceGatewayResult =
  | Readonly<{
      ok: true;
      citationId: string;
      replayed: boolean;
    }>
  | Readonly<{
      ok: false;
      code:
        | "raw_citation_not_found"
        | "idempotency_conflict"
        | "database_error"
        | "invalid_database_response";
    }>;

export type CitationNormalizationPersistenceGateway = (
  workspaceId: string,
  observationId: string,
  citationId: string,
  normalization: CitationUrlNormalizationResult,
) => Promise<CitationNormalizationPersistenceGatewayResult>;

export type NormalizePersistedCitationsRequest = Readonly<{
  workspaceId: unknown;
  observationId: unknown;
}>;

export type NormalizePersistedCitationsResult =
  | Readonly<{
      ok: true;
      observationId: string;
      citationCount: number;
      normalizedCount: number;
      excludedCount: number;
      replayedCount: number;
      methodVersion: typeof CITATION_URL_NORMALIZATION_VERSION;
    }>
  | Readonly<{
      ok: false;
      stage: "request";
      code: "invalid_workspace_id" | "invalid_observation_id";
    }>
  | Readonly<{
      ok: false;
      stage: "read";
      code:
        | "observation_not_found"
        | "database_error"
        | "invalid_database_response";
    }>
  | Readonly<{
      ok: false;
      stage: "persist";
      citationId: string;
      code:
        | "raw_citation_not_found"
        | "idempotency_conflict"
        | "database_error"
        | "invalid_database_response";
    }>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function validateCitations(
  citations: ReadonlyArray<PersistedCitationOccurrence>,
): ReadonlyArray<PersistedCitationOccurrence> | null {
  if (citations.length > MAX_CITATION_COUNT) return null;

  const output: PersistedCitationOccurrence[] = [];
  const citationIds = new Set<string>();
  let previousOrdinal = -1;

  for (const citation of citations) {
    if (
      typeof citation !== "object" ||
      citation === null ||
      !Number.isSafeInteger(citation.citationOrdinal) ||
      citation.citationOrdinal < 0 ||
      citation.citationOrdinal > 49 ||
      citation.citationOrdinal <= previousOrdinal ||
      typeof citation.citationId !== "string" ||
      citation.citationId.length < 1 ||
      citation.citationId.length > MAX_CITATION_ID_LENGTH ||
      !citation.citationId.isWellFormed() ||
      citationIds.has(citation.citationId) ||
      typeof citation.citedUrl !== "string" ||
      citation.citedUrl.length < 1 ||
      citation.citedUrl.length > MAX_CITATION_URL_LENGTH ||
      !citation.citedUrl.isWellFormed()
    )
      return null;

    citationIds.add(citation.citationId);
    previousOrdinal = citation.citationOrdinal;
    output.push(
      Object.freeze({
        citationOrdinal: citation.citationOrdinal,
        citationId: citation.citationId,
        citedUrl: citation.citedUrl,
      }),
    );
  }

  return Object.freeze(output);
}

/**
 * Normalizes the already-persisted citation occurrences for one observation.
 * Raw citations remain the source evidence; this use case never deduplicates,
 * rewrites, fetches, or infers support/brand relationships.
 */
export async function normalizePersistedCitations(
  request: NormalizePersistedCitationsRequest,
  readGateway: CitationNormalizationReadGateway,
  persistenceGateway: CitationNormalizationPersistenceGateway,
): Promise<NormalizePersistedCitationsResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null)
    return { ok: false, stage: "request", code: "invalid_workspace_id" };

  const observationId = normalizeUuid(request.observationId);
  if (observationId === null)
    return { ok: false, stage: "request", code: "invalid_observation_id" };

  const readResult = await readGateway(workspaceId, observationId);
  if (!readResult.ok)
    return { ok: false, stage: "read", code: readResult.code };

  const citations = validateCitations(readResult.citations);
  if (citations === null)
    return { ok: false, stage: "read", code: "invalid_database_response" };

  let normalizedCount = 0;
  let excludedCount = 0;
  let replayedCount = 0;

  for (const citation of citations) {
    const normalization = normalizeCitationUrl(citation.citedUrl);
    const persistResult = await persistenceGateway(
      workspaceId,
      observationId,
      citation.citationId,
      normalization,
    );
    if (!persistResult.ok)
      return {
        ok: false,
        stage: "persist",
        citationId: citation.citationId,
        code: persistResult.code,
      };

    if (persistResult.citationId !== citation.citationId)
      return {
        ok: false,
        stage: "persist",
        citationId: citation.citationId,
        code: "invalid_database_response",
      };

    if (normalization.state === "normalized") normalizedCount += 1;
    else excludedCount += 1;
    if (persistResult.replayed) replayedCount += 1;
  }

  return Object.freeze({
    ok: true,
    observationId,
    citationCount: citations.length,
    normalizedCount,
    excludedCount,
    replayedCount,
    methodVersion: CITATION_URL_NORMALIZATION_VERSION,
  });
}
