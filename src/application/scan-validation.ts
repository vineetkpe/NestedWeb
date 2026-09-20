import type { CompanyProfile } from "../domain/company-profile.ts";
import {
  promptQueryId,
  promptTemplateCategories,
  type GeneratedPrompt,
  type PromptTemplateVersion,
} from "../domain/prompt-library.ts";
import type {
  Citation,
  ObservationFailureCode,
  RawObservation,
} from "../domain/raw-observation.ts";
import type { ScanRequest } from "../domain/scan.ts";
import {
  isCompanyProfile,
  profileFieldNames,
} from "./company-profile-validation.ts";
import type {
  GroundedAIProvider,
  GroundedQueryRequest,
  GroundedQueryResponse,
} from "./grounded-ai-provider.ts";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, limit: number): value is string {
  return (
    typeof value === "string" && value.length <= limit && value.isWellFormed()
  );
}
function label(value: unknown, limit = 64): value is string {
  return text(value, limit) && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value);
}
function integer(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= max
  );
}

/** Bound data before cloning; reject accessors, cycles and non-JSON objects.
 * Repeated references are allowed and count each time, as they would in JSON. */
function boundedData(input: unknown, byteLimit: number): boolean {
  let remaining = byteLimit;
  let nodes = 20000;
  const ancestors = new Set<object>();
  const encoder = new TextEncoder();
  const string = (value: string): boolean => {
    if (value.length > remaining) return false;
    remaining -= encoder.encode(value).byteLength;
    return remaining >= 0;
  };
  const visit = (value: unknown, depth: number): boolean => {
    if (--nodes < 0 || --remaining < 0 || depth > 32) return false;
    if (typeof value === "string") return string(value);
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || ancestors.has(value)) return false;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return false;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length > nodes ||
      (Array.isArray(value) && keys.length !== value.length + 1)
    )
      return false;
    ancestors.add(value);
    for (const key of keys) {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (Array.isArray(value) && key === "length") continue;
      if (
        Array.isArray(value) &&
        (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
      )
        return false;
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value") ||
        !string(key) ||
        !visit(descriptor.value, depth + 1)
      )
        return false;
    }
    ancestors.delete(value);
    return true;
  };
  return visit(input, 0);
}

function template(value: unknown): value is PromptTemplateVersion {
  return (
    typeof value === "string" && Object.hasOwn(promptTemplateCategories, value)
  );
}
function fieldName(value: unknown): value is keyof CompanyProfile["fields"] {
  return profileFieldNames.some((name) => name === value);
}
function planned(
  value: unknown,
  profile: CompanyProfile,
): value is GeneratedPrompt {
  if (
    !record(value) ||
    value.state !== "planned" ||
    value.language !== "en" ||
    value.locale !== null ||
    !template(value.templateVersion) ||
    value.category !== promptTemplateCategories[value.templateVersion] ||
    !text(value.text, 600) ||
    !value.text.trim() ||
    !text(value.queryId, 8192) ||
    value.queryId !== promptQueryId(value.templateVersion, value.text) ||
    !Array.isArray(value.evidenceRefs) ||
    value.evidenceRefs.length < 1 ||
    value.evidenceRefs.length > 9
  )
    return false;
  for (const ref of value.evidenceRefs) {
    if (
      !record(ref) ||
      !fieldName(ref.field) ||
      !integer(ref.valueIndex, 199) ||
      !Array.isArray(ref.evidenceIndexes) ||
      ref.evidenceIndexes.length < 1 ||
      ref.evidenceIndexes.length > 200
    )
      return false;
    const claim = profile.fields[ref.field];
    if (claim.status !== "confirmed") return false;
    const source = claim.values[ref.valueIndex];
    if (
      !source ||
      new Set(ref.evidenceIndexes).size !== ref.evidenceIndexes.length ||
      !ref.evidenceIndexes.every((index: unknown) =>
        integer(index, source.evidence.length - 1),
      )
    )
      return false;
  }
  return true;
}

export function snapshotScan(input: unknown): ScanRequest | null {
  if (
    !boundedData(input, 2 * 1024 * 1024) ||
    !record(input) ||
    !label(input.scanId, 40) ||
    !label(input.attemptId, 40) ||
    /\./.test(input.scanId + input.attemptId) ||
    !isCompanyProfile(input.profile)
  )
    return null;
  const cohort = input.cohort;
  if (
    !record(cohort) ||
    cohort.ok !== true ||
    cohort.methodVersion !== "niche-prompts-v1" ||
    cohort.profileMethodVersion !== input.profile.methodVersion ||
    !Array.isArray(cohort.prompts) ||
    cohort.prompts.length < 1 ||
    cohort.prompts.length > 10
  )
    return null;
  const prompts: GeneratedPrompt[] = [];
  for (const prompt of cohort.prompts) {
    if (
      !planned(prompt, input.profile) ||
      prompts.some((prior) => prior.queryId === prompt.queryId)
    )
      return null;
    prompts.push(prompt);
  }
  return structuredClone({
    scanId: input.scanId,
    attemptId: input.attemptId,
    profile: input.profile,
    cohort: {
      ok: true,
      methodVersion: "niche-prompts-v1",
      profileMethodVersion: input.profile.methodVersion,
      prompts,
    },
  });
}

export function isScanProvider(input: unknown): input is GroundedAIProvider {
  if (
    !record(input) ||
    typeof input.query !== "function" ||
    !record(input.capabilities)
  )
    return false;
  const caps = input.capabilities;
  return (
    label(caps.provider) &&
    label(caps.grounding) &&
    caps.surface === "api" &&
    caps.liveExecution === false &&
    caps.maxQueries === 1 &&
    integer(caps.maxCitations, 50) &&
    caps.maxCitations > 0
  );
}

function date(value: unknown): value is string {
  if (!text(value, 24) || value.length !== 24) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
function nullableText(value: unknown, limit: number): value is string | null {
  return value === null || text(value, limit);
}
const failureCodes: Readonly<Record<ObservationFailureCode, true>> = {
  live_provider_unavailable: true,
  busy: true,
  cancelled: true,
  timeout: true,
  network_error: true,
  unauthorized: true,
  rate_limited: true,
  provider_error: true,
  invalid_response: true,
  response_too_large: true,
  credential_echo: true,
};

function citation(
  value: unknown,
  observationId: string,
  observedAt: string,
): value is Citation {
  if (
    !record(value) ||
    !text(value.citationId, 256) ||
    !value.citationId ||
    value.observationId !== observationId ||
    value.capturedAt !== observedAt ||
    !text(value.citedUrl, 8192) ||
    !nullableText(value.sourceTitle, 512) ||
    value.relationship !== "source_list_only" ||
    value.verification !== "not_checked" ||
    !integer(value.groundingChunkIndex, 49)
  )
    return false;
  return (
    (value.urlStatus === "eligible" &&
      text(value.sourceDomain, 253) &&
      value.sourceDomain.length > 0 &&
      value.exclusionReason === null) ||
    (value.urlStatus === "excluded" &&
      value.sourceDomain === null &&
      value.exclusionReason === "unsafe_url")
  );
}

function observation(
  value: unknown,
  query: GroundedQueryRequest,
  caps: GroundedAIProvider["capabilities"],
): value is RawObservation {
  if (
    !record(value) ||
    value.observationId !== query.observationId ||
    value.queryId !== query.queryId ||
    value.queryVersion !== query.queryVersion ||
    value.queryText !== query.queryText ||
    value.provider !== caps.provider ||
    value.surface !== caps.surface ||
    !label(value.captureVersion, 128) ||
    !text(value.requestedModel, 512) ||
    !nullableText(value.modelVersion, 512) ||
    !nullableText(value.providerResponseId, 512) ||
    !date(value.observedAt) ||
    !nullableText(value.rawResponse, 2 * 1024 * 1024) ||
    !nullableText(value.answerText, 2 * 1024 * 1024) ||
    !nullableText(value.finishReason, 512) ||
    (value.groundingMetadata !== null &&
      (!record(value.groundingMetadata) ||
        !boundedData(value.groundingMetadata, 2 * 1024 * 1024))) ||
    !Array.isArray(value.citations) ||
    value.citations.length > caps.maxCitations
  )
    return false;
  if (value.outcome === "failed") {
    if (
      typeof value.failureCode !== "string" ||
      !Object.hasOwn(failureCodes, value.failureCode)
    )
      return false;
  } else if (
    typeof value.outcome !== "string" ||
    !["answered", "refused", "partial"].includes(value.outcome) ||
    value.failureCode !== null
  )
    return false;
  if (value.rawResponseState === "complete") {
    if (
      value.rawResponse === null ||
      new TextEncoder().encode(value.rawResponse).byteLength >
        2 * 1024 * 1024 ||
      typeof value.responseDigest !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(value.responseDigest)
    )
      return false;
  } else if (
    (value.rawResponseState !== "not_received" &&
      value.rawResponseState !== "discarded") ||
    value.rawResponse !== null ||
    value.responseDigest !== null ||
    value.outcome !== "failed" ||
    value.answerText !== null ||
    value.groundingMetadata !== null ||
    value.citations.length !== 0
  )
    return false;
  if (value.captureMode === "not_executed") {
    if (value.outcome !== "failed" || value.rawResponseState !== "not_received")
      return false;
  } else if (value.captureMode !== "injected_transport") return false;
  const ids = new Set<string>();
  for (const entry of value.citations) {
    if (
      !citation(entry, query.observationId, value.observedAt) ||
      ids.has(entry.citationId)
    )
      return false;
    ids.add(entry.citationId);
  }
  return true;
}

export function snapshotScanResponse(
  input: unknown,
  query: GroundedQueryRequest,
  caps: GroundedAIProvider["capabilities"],
): GroundedQueryResponse | null {
  if (!boundedData(input, 8 * 1024 * 1024) || !record(input)) return null;
  if (
    input.ok === false &&
    (input.code === "invalid_request" || input.code === "invalid_clock")
  )
    return { ok: false, code: input.code };
  if (input.ok !== true || !observation(input.observation, query, caps))
    return null;
  return { ok: true, observation: structuredClone(input.observation) };
}
