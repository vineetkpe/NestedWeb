import "server-only";

import {
  normalizePersistedCitations,
  type CitationNormalizationPersistenceGateway,
  type CitationNormalizationPersistenceGatewayResult,
  type CitationNormalizationReadGateway,
  type CitationNormalizationReadGatewayResult,
  type NormalizePersistedCitationsRequest,
  type NormalizePersistedCitationsResult,
  type PersistedCitationOccurrence,
} from "../application/citation-normalization-persistence.ts";
import type { CitationUrlNormalizationResult } from "../domain/citation-url-normalization.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SupabaseCitationNormalizationRpcName =
  "list_raw_citations_for_normalization" | "persist_citation_url_normalization";

export type SupabaseCitationNormalizationRpc = (
  name: SupabaseCitationNormalizationRpcName,
  args: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function parseEnvelope(
  value: unknown,
):
  | Readonly<{ ok: true; data: unknown }>
  | Readonly<{
      ok: false;
      error: Record<string, unknown> | null;
      invalid: boolean;
    }> {
  if (
    !record(value) ||
    !Object.hasOwn(value, "data") ||
    !Object.hasOwn(value, "error")
  )
    return { ok: false, error: null, invalid: true };

  if (value.error !== null && value.error !== undefined)
    return {
      ok: false,
      error: record(value.error) ? value.error : null,
      invalid: false,
    };

  return { ok: true, data: value.data };
}

function parseCitationRows(
  value: unknown,
  observationId: string,
): ReadonlyArray<PersistedCitationOccurrence> | null {
  if (
    !record(value) ||
    !hasExactKeys(value, ["observationId", "citations"]) ||
    typeof value.observationId !== "string" ||
    !UUID_PATTERN.test(value.observationId) ||
    value.observationId.toLowerCase() !== observationId ||
    !Array.isArray(value.citations) ||
    value.citations.length > 50
  )
    return null;

  const citations: PersistedCitationOccurrence[] = [];
  for (const citation of value.citations) {
    if (
      !record(citation) ||
      !hasExactKeys(citation, ["citationOrdinal", "citationId", "citedUrl"]) ||
      typeof citation.citationOrdinal !== "number" ||
      !Number.isSafeInteger(citation.citationOrdinal) ||
      typeof citation.citationId !== "string" ||
      typeof citation.citedUrl !== "string"
    )
      return null;
    citations.push(
      Object.freeze({
        citationOrdinal: citation.citationOrdinal,
        citationId: citation.citationId,
        citedUrl: citation.citedUrl,
      }),
    );
  }
  return Object.freeze(citations);
}

async function readPersistedCitations(
  workspaceId: string,
  observationId: string,
  rpc: SupabaseCitationNormalizationRpc,
): Promise<CitationNormalizationReadGatewayResult> {
  let response: unknown;
  try {
    response = await rpc("list_raw_citations_for_normalization", {
      p_workspace_id: workspaceId,
      p_observation_id: observationId,
    });
  } catch {
    return { ok: false, code: "database_error" };
  }

  const envelope = parseEnvelope(response);
  if (!envelope.ok) {
    if (envelope.invalid)
      return { ok: false, code: "invalid_database_response" };
    if (
      envelope.error?.code === "P0001" &&
      envelope.error.message === "Raw observation not found"
    )
      return { ok: false, code: "observation_not_found" };
    return { ok: false, code: "database_error" };
  }

  const citations = parseCitationRows(envelope.data, observationId);
  if (citations === null)
    return { ok: false, code: "invalid_database_response" };
  return { ok: true, citations };
}

function mapPersistenceError(
  error: Record<string, unknown> | null,
): CitationNormalizationPersistenceGatewayResult {
  if (error?.code === "P0001" && error.message === "Raw citation not found")
    return { ok: false, code: "raw_citation_not_found" };
  if (
    error?.code === "22023" &&
    error.message ===
      "Citation normalization replay conflicts with stored evidence"
  )
    return { ok: false, code: "idempotency_conflict" };
  return { ok: false, code: "database_error" };
}

async function persistCitationNormalization(
  workspaceId: string,
  observationId: string,
  citationId: string,
  normalization: CitationUrlNormalizationResult,
  rpc: SupabaseCitationNormalizationRpc,
): Promise<CitationNormalizationPersistenceGatewayResult> {
  let response: unknown;
  try {
    response = await rpc("persist_citation_url_normalization", {
      p_workspace_id: workspaceId,
      p_observation_id: observationId,
      p_citation_id: citationId,
      p_normalization: normalization,
    });
  } catch {
    return { ok: false, code: "database_error" };
  }

  const envelope = parseEnvelope(response);
  if (!envelope.ok) {
    if (envelope.invalid)
      return { ok: false, code: "invalid_database_response" };
    return mapPersistenceError(envelope.error);
  }

  const data = envelope.data;
  if (
    !record(data) ||
    !hasExactKeys(data, [
      "observationId",
      "citationId",
      "methodVersion",
      "state",
      "replayed",
    ]) ||
    data.observationId !== observationId ||
    data.citationId !== citationId ||
    data.methodVersion !== normalization.methodVersion ||
    data.state !== normalization.state ||
    typeof data.replayed !== "boolean"
  )
    return { ok: false, code: "invalid_database_response" };

  return Object.freeze({
    ok: true,
    citationId,
    replayed: data.replayed,
  });
}

/**
 * Server-only composition of D1c. The caller supplies one service-role RPC
 * transport; this module never receives table access and cannot bypass the two
 * narrow database functions.
 */
export function executeSupabaseCitationNormalization(
  request: NormalizePersistedCitationsRequest,
  rpc: SupabaseCitationNormalizationRpc,
): Promise<NormalizePersistedCitationsResult> {
  const readGateway: CitationNormalizationReadGateway = (
    workspaceId,
    observationId,
  ) => readPersistedCitations(workspaceId, observationId, rpc);
  const persistenceGateway: CitationNormalizationPersistenceGateway = (
    workspaceId,
    observationId,
    citationId,
    normalization,
  ) =>
    persistCitationNormalization(
      workspaceId,
      observationId,
      citationId,
      normalization,
      rpc,
    );

  return normalizePersistedCitations(request, readGateway, persistenceGateway);
}
