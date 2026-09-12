import type { RawObservation } from "../domain/raw-observation.ts";

export type GroundedQueryRequest = Readonly<{
  observationId: string;
  queryId: string;
  queryVersion: string;
  queryText: string;
}>;

export type GroundedQueryResponse =
  | Readonly<{ ok: true; observation: RawObservation }>
  | Readonly<{ ok: false; code: "invalid_request" | "invalid_clock" }>;

export interface GroundedAIProvider {
  readonly capabilities: Readonly<{
    provider: "gemini";
    surface: "api";
    grounding: "google_search";
    liveExecution: boolean;
    maxQueries: 1;
    maxCitations: 50;
  }>;
  query(input: unknown, signal?: AbortSignal): Promise<GroundedQueryResponse>;
}

/** Structural input validation does not grant execution authorization. */
export function validateGroundedQuery(
  input: unknown,
): GroundedQueryRequest | null {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return null;
  if (
    !("observationId" in input) ||
    !("queryId" in input) ||
    !("queryVersion" in input) ||
    !("queryText" in input)
  )
    return null;
  const { observationId, queryId, queryVersion, queryText } = input;
  if (
    typeof observationId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(observationId)
  )
    return null;
  for (const [value, max] of [
    [queryId, 8192],
    [queryVersion, 128],
    [queryText, 600],
  ] as const) {
    if (
      typeof value !== "string" ||
      value.length > max ||
      !value.trim() ||
      !value.isWellFormed()
    )
      return null;
  }
  if (
    typeof queryId !== "string" ||
    typeof queryVersion !== "string" ||
    typeof queryText !== "string"
  )
    return null;
  // Copy before awaiting transport: callers cannot change an in-flight identity.
  return { observationId, queryId, queryVersion, queryText };
}
