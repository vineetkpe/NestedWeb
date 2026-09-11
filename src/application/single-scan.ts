import type {
  GroundedAIProvider,
  GroundedQueryRequest,
  GroundedQueryResponse,
} from "./grounded-ai-provider.ts";
import type { RawObservation } from "../domain/raw-observation.ts";

export type ScanBoundaryFailureCode =
  | "invalid_request"
  | "invalid_clock"
  | "provider_exception";

export type PlannedScanQuery = Readonly<
  Omit<GroundedQueryRequest, "observationId">
>;

export type ScanQueryResult =
  | Readonly<{
      state: "answered" | "partial" | "refused" | "failed" | "cancelled";
      query: PlannedScanQuery;
      observationId: string;
      observation: RawObservation;
    }>
  | Readonly<{
      state: "boundary_failure";
      query: PlannedScanQuery;
      observationId: string;
      observation: null;
      code: ScanBoundaryFailureCode;
    }>
  | Readonly<{
      state: "unattempted";
      query: PlannedScanQuery;
      observationId: string;
      observation: null;
      reason: "cancelled";
    }>;

export type SingleScanResult = Readonly<{
  scanId: string;
  attemptId: string;
  queries: readonly ScanQueryResult[];
}>;

export type SingleScanRunResult =
  | Readonly<{ ok: true; result: SingleScanResult }>
  | Readonly<{
      ok: false;
      code: "invalid_scan_identity" | "invalid_prompts" | "too_many_prompts";
    }>;

type ScanInput = Readonly<{
  scanId: string;
  attemptId: string;
  prompts: readonly PlannedScanQuery[];
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-zA-Z0-9_-]{1,96}$/.test(value) &&
    value.isWellFormed()
  );
}

function validText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length <= max &&
    value.trim().length > 0 &&
    value.isWellFormed()
  );
}

function validateInput(input: unknown): SingleScanRunResult | ScanInput {
  if (!record(input)) return { ok: false, code: "invalid_scan_identity" };
  if (!validIdentity(input.scanId) || !validIdentity(input.attemptId))
    return { ok: false, code: "invalid_scan_identity" };
  if (!Array.isArray(input.prompts)) return { ok: false, code: "invalid_prompts" };
  if (input.prompts.length > 10)
    return { ok: false, code: "too_many_prompts" };

  const prompts: PlannedScanQuery[] = [];
  const queryIds = new Set<string>();
  for (const value of input.prompts) {
    if (
      !record(value) ||
      value.state !== "planned" ||
      !validText(value.queryId, 8192) ||
      !validText(value.templateVersion, 128) ||
      !validText(value.text, 600) ||
      queryIds.has(value.queryId)
    )
      return { ok: false, code: "invalid_prompts" };
    queryIds.add(value.queryId);
    prompts.push({
      queryId: value.queryId,
      queryVersion: value.templateVersion,
      queryText: value.text,
    });
  }

  return {
    scanId: input.scanId,
    attemptId: input.attemptId,
    prompts,
  };
}

function observationId(attemptId: string, index: number): string {
  return `${attemptId}-q${String(index + 1).padStart(2, "0")}`;
}

function outcomeState(
  observation: RawObservation,
): Extract<ScanQueryResult, { observation: RawObservation }>["state"] {
  return observation.outcome === "answered"
    ? "answered"
    : observation.outcome === "partial"
      ? "partial"
      : observation.outcome === "refused"
        ? "refused"
        : observation.failureCode === "cancelled"
          ? "cancelled"
          : "failed";
}

function boundaryFailure(
  query: PlannedScanQuery,
  id: string,
  response: Exclude<GroundedQueryResponse, { ok: true }>,
): ScanQueryResult {
  return {
    state: "boundary_failure",
    query,
    observationId: id,
    observation: null,
    code: response.code,
  };
}

/**
 * In-memory Level 2 preparation only. This coordinates the existing planned
 * prompt-library output against an injected provider contract; it does not
 * authorize live execution, persistence, retries, interpretation, metrics,
 * recommendations, or billing.
 */
export async function runSingleScan(
  input: unknown,
  provider: GroundedAIProvider,
  signal?: AbortSignal,
): Promise<SingleScanRunResult> {
  const validated = validateInput(input);
  if ("ok" in validated) return validated;

  const results: ScanQueryResult[] = [];
  for (const [index, query] of validated.prompts.entries()) {
    const id = observationId(validated.attemptId, index);
    if (signal?.aborted) {
      results.push({
        state: "unattempted",
        query,
        observationId: id,
        observation: null,
        reason: "cancelled",
      });
      continue;
    }

    let response: GroundedQueryResponse;
    try {
      response = await provider.query(
        {
          observationId: id,
          queryId: query.queryId,
          queryVersion: query.queryVersion,
          queryText: query.queryText,
        },
        signal,
      );
    } catch {
      results.push({
        state: "boundary_failure",
        query,
        observationId: id,
        observation: null,
        code: "provider_exception",
      });
      continue;
    }

    if (!response.ok) {
      results.push(boundaryFailure(query, id, response));
      continue;
    }

    const observation = response.observation;
    if (
      observation.observationId !== id ||
      observation.queryId !== query.queryId ||
      observation.queryVersion !== query.queryVersion ||
      observation.queryText !== query.queryText
    ) {
      results.push({
        state: "boundary_failure",
        query,
        observationId: id,
        observation: null,
        code: "provider_exception",
      });
      continue;
    }

    results.push({
      state: outcomeState(observation),
      query,
      observationId: id,
      observation,
    });
  }

  return {
    ok: true,
    result: {
      scanId: validated.scanId,
      attemptId: validated.attemptId,
      queries: results,
    },
  };
}
