import type {
  Citation,
  ObservationFailureCode,
  RawObservation,
} from "../domain/raw-observation.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339_MILLIS_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RESPONSE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const MAX_JSON_NODES = 20_000;
const MAX_JSON_DEPTH = 32;

const failureCodes = new Set<ObservationFailureCode>([
  "live_provider_unavailable",
  "busy",
  "cancelled",
  "timeout",
  "network_error",
  "unauthorized",
  "rate_limited",
  "provider_error",
  "invalid_response",
  "response_too_large",
  "credential_echo",
]);

export type PersistGroundedObservationRequest = Readonly<{
  workspaceId: unknown;
  scanId: unknown;
  attemptId: unknown;
  workerId: unknown;
  leaseToken: unknown;
  queryOrdinal: unknown;
  observation: unknown;
}>;

export type ValidatedGroundedObservationPersistenceRequest = Readonly<{
  workspaceId: string;
  scanId: string;
  attemptId: string;
  workerId: string;
  leaseToken: string;
  queryOrdinal: number;
  observation: RawObservation;
}>;

export type GroundedObservationSnapshotSummary = Readonly<{
  observationId: string;
  state: "answered" | "refused" | "partial" | "failed" | "cancelled";
  citationCount: number;
  replayed: boolean;
}>;

export type GroundedObservationPersistenceGatewayFailureCode =
  | "lease_not_found"
  | "lease_expired"
  | "identity_mismatch"
  | "idempotency_conflict"
  | "database_error"
  | "invalid_database_response";

export type GroundedObservationPersistenceGatewayResult =
  | Readonly<{ ok: true; snapshot: GroundedObservationSnapshotSummary }>
  | Readonly<{
      ok: false;
      code: GroundedObservationPersistenceGatewayFailureCode;
    }>;

export type GroundedObservationPersistenceGateway = (
  request: ValidatedGroundedObservationPersistenceRequest,
) => Promise<GroundedObservationPersistenceGatewayResult>;

export type PersistGroundedObservationResult =
  | GroundedObservationPersistenceGatewayResult
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "invalid_scan_id"
        | "invalid_attempt_id"
        | "invalid_worker_id"
        | "invalid_lease_token"
        | "invalid_query_ordinal"
        | "invalid_observation";
    }>;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type JsonBudget = { nodes: number };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function boundedString(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): string | null {
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    (!allowEmpty && value.length === 0) ||
    !value.isWellFormed()
  )
    return null;
  return value;
}

function optionalString(value: unknown, maxLength: number): string | null | undefined {
  if (value === null) return null;
  const text = boundedString(value, maxLength);
  return text === null ? undefined : text;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function snapshotJson(
  value: unknown,
  budget: JsonBudget,
  depth = 0,
): JsonValue | undefined {
  budget.nodes -= 1;
  if (budget.nodes < 0 || depth > MAX_JSON_DEPTH) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const output: JsonValue[] = [];
    for (const entry of value) {
      const copied = snapshotJson(entry, budget, depth + 1);
      if (copied === undefined) return undefined;
      output.push(copied);
    }
    return Object.freeze(output) as JsonValue[];
  }
  if (!record(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const output: Record<string, JsonValue> = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") return undefined;
    const descriptor = descriptors[key];
    if (!descriptor || descriptor.get || descriptor.set || !("value" in descriptor))
      return undefined;
    if (!descriptor.enumerable) continue;
    const copied = snapshotJson(descriptor.value, budget, depth + 1);
    if (copied === undefined) return undefined;
    output[key] = copied;
  }
  return Object.freeze(output);
}

function snapshotCitation(
  input: unknown,
  observationId: string,
  observedAt: string,
  previousChunkIndex: number,
): Citation | null {
  if (!record(input)) return null;
  const groundingChunkIndex = input.groundingChunkIndex;
  if (
    typeof groundingChunkIndex !== "number" ||
    !Number.isSafeInteger(groundingChunkIndex) ||
    groundingChunkIndex < 0 ||
    groundingChunkIndex > 49 ||
    groundingChunkIndex <= previousChunkIndex
  )
    return null;

  const citedUrl = boundedString(input.citedUrl, 8192);
  const sourceTitle = optionalString(input.sourceTitle, 512);
  const sourceDomain = optionalString(input.sourceDomain, 253);
  const exclusionReason = input.exclusionReason;
  if (
    citedUrl === null ||
    sourceTitle === undefined ||
    sourceDomain === undefined ||
    input.observationId !== observationId ||
    input.citationId !== `${observationId}:grounding:${groundingChunkIndex}` ||
    input.capturedAt !== observedAt ||
    input.relationship !== "source_list_only" ||
    input.verification !== "not_checked"
  )
    return null;

  const common = {
    citationId: input.citationId,
    observationId,
    citedUrl,
    sourceTitle,
    capturedAt: observedAt,
    relationship: "source_list_only" as const,
    verification: "not_checked" as const,
    groundingChunkIndex,
  };

  if (
    input.urlStatus === "eligible" &&
    typeof sourceDomain === "string" &&
    exclusionReason === null
  )
    return Object.freeze({
      ...common,
      urlStatus: "eligible" as const,
      sourceDomain,
      exclusionReason: null,
    });

  if (
    input.urlStatus === "excluded" &&
    sourceDomain === null &&
    exclusionReason === "unsafe_url"
  )
    return Object.freeze({
      ...common,
      urlStatus: "excluded" as const,
      sourceDomain: null,
      exclusionReason: "unsafe_url" as const,
    });

  return null;
}

function snapshotObservation(value: unknown): RawObservation | null {
  if (!record(value)) return null;

  const observationId = normalizeUuid(value.observationId);
  const queryId = boundedString(value.queryId, 8192);
  const queryVersion = boundedString(value.queryVersion, 120);
  const queryText = boundedString(value.queryText, 600);
  const requestedModel = boundedString(value.requestedModel, 120);
  const modelVersion = optionalString(value.modelVersion, 512);
  const providerResponseId = optionalString(value.providerResponseId, 512);
  const answerText = optionalString(value.answerText, MAX_EVIDENCE_BYTES);
  const finishReason = optionalString(value.finishReason, 512);
  if (
    observationId === null ||
    queryId === null ||
    queryVersion === null ||
    queryText === null ||
    requestedModel === null ||
    modelVersion === undefined ||
    providerResponseId === undefined ||
    answerText === undefined ||
    finishReason === undefined ||
    value.provider !== "gemini" ||
    value.surface !== "api" ||
    value.captureVersion !== "gemini-generate-content-v1" ||
    (value.captureMode !== "injected_transport" &&
      value.captureMode !== "not_executed") ||
    typeof value.observedAt !== "string" ||
    !RFC3339_MILLIS_PATTERN.test(value.observedAt) ||
    !Number.isFinite(Date.parse(value.observedAt)) ||
    !Array.isArray(value.citations) ||
    value.citations.length > 50
  )
    return null;

  const rawResponseState = value.rawResponseState;
  let rawResponse: string | null;
  let responseDigest: string | null;
  if (rawResponseState === "complete") {
    rawResponse = boundedString(value.rawResponse, MAX_EVIDENCE_BYTES, true);
    responseDigest = boundedString(value.responseDigest, 71);
    if (
      rawResponse === null ||
      byteLength(rawResponse) > MAX_EVIDENCE_BYTES ||
      responseDigest === null ||
      !RESPONSE_DIGEST_PATTERN.test(responseDigest)
    )
      return null;
  } else if (
    rawResponseState === "not_received" ||
    rawResponseState === "discarded"
  ) {
    if (value.rawResponse !== null || value.responseDigest !== null) return null;
    rawResponse = null;
    responseDigest = null;
  } else {
    return null;
  }

  const outcome = value.outcome;
  const failureCode = value.failureCode;
  if (
    outcome !== "answered" &&
    outcome !== "refused" &&
    outcome !== "partial" &&
    outcome !== "failed"
  )
    return null;
  if (
    (outcome === "failed" &&
      (typeof failureCode !== "string" ||
        !failureCodes.has(failureCode as ObservationFailureCode))) ||
    (outcome !== "failed" && failureCode !== null)
  )
    return null;

  let groundingMetadata: Readonly<Record<string, unknown>> | null = null;
  if (value.groundingMetadata !== null) {
    const copied = snapshotJson(value.groundingMetadata, { nodes: MAX_JSON_NODES });
    if (!record(copied) || byteLength(JSON.stringify(copied)) > MAX_EVIDENCE_BYTES)
      return null;
    groundingMetadata = copied;
  }

  const citations: Citation[] = [];
  let previousChunkIndex = -1;
  for (const citation of value.citations) {
    const copied = snapshotCitation(
      citation,
      observationId,
      value.observedAt,
      previousChunkIndex,
    );
    if (copied === null) return null;
    citations.push(copied);
    previousChunkIndex = copied.groundingChunkIndex;
  }

  return Object.freeze({
    observationId,
    queryId,
    queryVersion,
    queryText,
    provider: "gemini" as const,
    surface: "api" as const,
    captureVersion: "gemini-generate-content-v1" as const,
    captureMode: value.captureMode,
    requestedModel,
    modelVersion,
    providerResponseId,
    observedAt: value.observedAt,
    rawResponse,
    responseDigest,
    rawResponseState,
    outcome,
    failureCode: outcome === "failed" ? (failureCode as ObservationFailureCode) : null,
    answerText,
    finishReason,
    groundingMetadata,
    citations: Object.freeze(citations),
  });
}

export async function persistGroundedObservation(
  request: PersistGroundedObservationRequest,
  gateway: GroundedObservationPersistenceGateway,
): Promise<PersistGroundedObservationResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) return { ok: false, code: "invalid_workspace_id" };
  const scanId = normalizeUuid(request.scanId);
  if (scanId === null) return { ok: false, code: "invalid_scan_id" };
  const attemptId = normalizeUuid(request.attemptId);
  if (attemptId === null) return { ok: false, code: "invalid_attempt_id" };
  const workerId = normalizeUuid(request.workerId);
  if (workerId === null) return { ok: false, code: "invalid_worker_id" };
  const leaseToken = normalizeUuid(request.leaseToken);
  if (leaseToken === null) return { ok: false, code: "invalid_lease_token" };
  if (
    typeof request.queryOrdinal !== "number" ||
    !Number.isSafeInteger(request.queryOrdinal) ||
    request.queryOrdinal < 0 ||
    request.queryOrdinal > 9
  )
    return { ok: false, code: "invalid_query_ordinal" };

  const observation = snapshotObservation(request.observation);
  if (observation === null) return { ok: false, code: "invalid_observation" };

  return gateway(
    Object.freeze({
      workspaceId,
      scanId,
      attemptId,
      workerId,
      leaseToken,
      queryOrdinal: request.queryOrdinal,
      observation,
    }),
  );
}
