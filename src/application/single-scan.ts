import type {
  GroundedAIProvider,
  GroundedQueryRequest,
  GroundedQueryResponse,
} from "./grounded-ai-provider.ts";
import type { CompanyProfile } from "../domain/company-profile.ts";
import type {
  GeneratedPrompt,
  PromptCategory,
  PromptEvidenceReference,
  PromptGenerationResult,
  PromptTemplateVersion,
} from "../domain/prompt-library.ts";
import type { RawObservation } from "../domain/raw-observation.ts";

export type ScanBoundaryFailureCode =
  | "invalid_request"
  | "invalid_clock"
  | "provider_exception";

type PromptGenerationSuccess = Extract<PromptGenerationResult, { ok: true }>;

export type PlannedScanQuery = Readonly<
  Omit<GroundedQueryRequest, "observationId">
>;

export type ScanQueryResult =
  | Readonly<{
      state: "answered" | "partial" | "refused" | "failed" | "cancelled";
      prompt: GeneratedPrompt;
      query: PlannedScanQuery;
      observationId: string;
      observation: RawObservation;
    }>
  | Readonly<{
      state: "boundary_failure";
      prompt: GeneratedPrompt;
      query: PlannedScanQuery;
      observationId: string;
      observation: null;
      code: ScanBoundaryFailureCode;
    }>
  | Readonly<{
      state: "unattempted";
      prompt: GeneratedPrompt;
      query: PlannedScanQuery;
      observationId: string;
      observation: null;
      reason: "cancelled";
    }>;

export type SingleScanResult = Readonly<{
  scanId: string;
  attemptId: string;
  promptMethodVersion: PromptGenerationSuccess["methodVersion"];
  profileMethodVersion: PromptGenerationSuccess["profileMethodVersion"];
  queries: readonly ScanQueryResult[];
}>;

export type SingleScanRunResult =
  | Readonly<{ ok: true; result: SingleScanResult }>
  | Readonly<{
      ok: false;
      code:
        | "invalid_scan_identity"
        | "invalid_prompt_cohort"
        | "too_many_prompts"
        | "scan_invariant_failed";
    }>;

type ScanInput = Readonly<{
  scanId: string;
  attemptId: string;
  promptGeneration: PromptGenerationSuccess;
}>;

const templateCategories: Readonly<Record<PromptTemplateVersion, PromptCategory>> =
  Object.freeze({
    "category@v1": "category-discovery",
    "service-area@v1": "category-discovery",
    "best-audience@v1": "best-tools-platforms",
    "alternatives@v1": "alternatives",
    "comparison-category@v1": "comparison",
    "use-case@v1": "use-case-recommendation",
    "use-case-audience@v1": "use-case-recommendation",
    "buyer@v1": "buyer-intent",
  });

const profileFields = new Set<keyof CompanyProfile["fields"]>([
  "companyName",
  "productName",
  "shortDescription",
  "primaryProduct",
  "targetAudience",
  "industry",
  "keyUseCases",
  "capabilities",
  "geography",
]);

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

function integer(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= max
  );
}

function promptTemplateVersion(value: unknown): value is PromptTemplateVersion {
  return typeof value === "string" && Object.hasOwn(templateCategories, value);
}

function promptEvidenceReference(
  value: unknown,
): PromptEvidenceReference | null {
  if (
    !record(value) ||
    typeof value.field !== "string" ||
    !profileFields.has(value.field as keyof CompanyProfile["fields"]) ||
    !integer(value.valueIndex, 199) ||
    !Array.isArray(value.evidenceIndexes) ||
    value.evidenceIndexes.length === 0 ||
    value.evidenceIndexes.length > 200
  )
    return null;

  const evidenceIndexes: number[] = [];
  const seen = new Set<number>();
  for (const index of value.evidenceIndexes) {
    if (!integer(index, 199) || seen.has(index)) return null;
    seen.add(index);
    evidenceIndexes.push(index);
  }

  return Object.freeze({
    field: value.field as keyof CompanyProfile["fields"],
    valueIndex: value.valueIndex,
    evidenceIndexes: Object.freeze(evidenceIndexes),
  });
}

function expectedQueryId(templateVersion: PromptTemplateVersion, text: string): string {
  return `niche-prompts-v1:${encodeURIComponent(
    JSON.stringify([templateVersion, "en", null, text]),
  )}`;
}

function snapshotPrompt(value: unknown): GeneratedPrompt | null {
  if (
    !record(value) ||
    !promptTemplateVersion(value.templateVersion) ||
    typeof value.category !== "string" ||
    value.category !== templateCategories[value.templateVersion] ||
    value.language !== "en" ||
    value.locale !== null ||
    value.state !== "planned" ||
    !validText(value.text, 600) ||
    !validText(value.queryId, 8192) ||
    value.queryId !== expectedQueryId(value.templateVersion, value.text) ||
    !Array.isArray(value.evidenceRefs) ||
    value.evidenceRefs.length === 0 ||
    value.evidenceRefs.length > 2
  )
    return null;

  const evidenceRefs: PromptEvidenceReference[] = [];
  for (const reference of value.evidenceRefs) {
    const snapshot = promptEvidenceReference(reference);
    if (snapshot === null) return null;
    evidenceRefs.push(snapshot);
  }

  return Object.freeze({
    queryId: value.queryId,
    category: value.category as PromptCategory,
    text: value.text,
    templateVersion: value.templateVersion,
    language: "en",
    locale: null,
    state: "planned",
    evidenceRefs: Object.freeze(evidenceRefs),
  });
}

function validatePromptGeneration(
  value: unknown,
):
  | PromptGenerationSuccess
  | Readonly<{ ok: false; code: "invalid_prompt_cohort" | "too_many_prompts" }> {
  if (
    !record(value) ||
    value.ok !== true ||
    value.methodVersion !== "niche-prompts-v1" ||
    value.profileMethodVersion !== "company-profile-v2" ||
    !Array.isArray(value.prompts)
  )
    return { ok: false, code: "invalid_prompt_cohort" };
  if (value.prompts.length > 10)
    return { ok: false, code: "too_many_prompts" };

  const prompts: GeneratedPrompt[] = [];
  const queryIds = new Set<string>();
  for (const prompt of value.prompts) {
    const snapshot = snapshotPrompt(prompt);
    if (snapshot === null || queryIds.has(snapshot.queryId))
      return { ok: false, code: "invalid_prompt_cohort" };
    queryIds.add(snapshot.queryId);
    prompts.push(snapshot);
  }

  return Object.freeze({
    ok: true,
    methodVersion: "niche-prompts-v1",
    profileMethodVersion: "company-profile-v2",
    prompts: Object.freeze(prompts),
  });
}

function validateInput(
  input: unknown,
): SingleScanRunResult | ScanInput {
  if (!record(input)) return { ok: false, code: "invalid_scan_identity" };
  if (!validIdentity(input.scanId) || !validIdentity(input.attemptId))
    return { ok: false, code: "invalid_scan_identity" };

  const promptGeneration = validatePromptGeneration(input.promptGeneration);
  if (!promptGeneration.ok) return promptGeneration;

  return Object.freeze({
    scanId: input.scanId,
    attemptId: input.attemptId,
    promptGeneration,
  });
}

function executionQuery(prompt: GeneratedPrompt): PlannedScanQuery {
  return Object.freeze({
    queryId: prompt.queryId,
    queryVersion: prompt.templateVersion,
    queryText: prompt.text,
  });
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
  prompt: GeneratedPrompt,
  query: PlannedScanQuery,
  id: string,
  response: Exclude<GroundedQueryResponse, { ok: true }>,
): ScanQueryResult {
  return {
    state: "boundary_failure",
    prompt,
    query,
    observationId: id,
    observation: null,
    code: response.code,
  };
}

function completeAndDistinct(
  attemptId: string,
  prompts: readonly GeneratedPrompt[],
  results: readonly ScanQueryResult[],
): boolean {
  if (results.length !== prompts.length) return false;
  const observationIds = new Set<string>();
  for (const [index, result] of results.entries()) {
    const prompt = prompts[index];
    if (!prompt) return false;
    const expectedObservationId = observationId(attemptId, index);
    if (
      result.prompt.queryId !== prompt.queryId ||
      result.prompt.templateVersion !== prompt.templateVersion ||
      result.prompt.text !== prompt.text ||
      result.query.queryId !== prompt.queryId ||
      result.query.queryVersion !== prompt.templateVersion ||
      result.query.queryText !== prompt.text ||
      result.observationId !== expectedObservationId ||
      observationIds.has(result.observationId)
    )
      return false;
    observationIds.add(result.observationId);
    if (
      result.observation !== null &&
      (result.observation.observationId !== result.observationId ||
        result.observation.queryId !== result.query.queryId ||
        result.observation.queryVersion !== result.query.queryVersion ||
        result.observation.queryText !== result.query.queryText)
    )
      return false;
  }
  return true;
}

/**
 * In-memory Level 2 preparation only. This coordinates one validated prompt
 * cohort against an injected provider contract; it does not authorize live
 * execution, persistence, retries, interpretation, metrics, recommendations,
 * or billing.
 */
export async function runSingleScan(
  input: unknown,
  provider: GroundedAIProvider,
  signal?: AbortSignal,
): Promise<SingleScanRunResult> {
  const validated = validateInput(input);
  if ("ok" in validated) return validated;

  const results: ScanQueryResult[] = [];
  for (const [index, prompt] of validated.promptGeneration.prompts.entries()) {
    const query = executionQuery(prompt);
    const id = observationId(validated.attemptId, index);
    if (signal?.aborted) {
      results.push({
        state: "unattempted",
        prompt,
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
        prompt,
        query,
        observationId: id,
        observation: null,
        code: "provider_exception",
      });
      continue;
    }

    if (!response.ok) {
      results.push(boundaryFailure(prompt, query, id, response));
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
        prompt,
        query,
        observationId: id,
        observation: null,
        code: "provider_exception",
      });
      continue;
    }

    results.push({
      state: outcomeState(observation),
      prompt,
      query,
      observationId: id,
      observation,
    });
  }

  if (
    !completeAndDistinct(
      validated.attemptId,
      validated.promptGeneration.prompts,
      results,
    )
  )
    return { ok: false, code: "scan_invariant_failed" };

  return {
    ok: true,
    result: {
      scanId: validated.scanId,
      attemptId: validated.attemptId,
      promptMethodVersion: validated.promptGeneration.methodVersion,
      profileMethodVersion: validated.promptGeneration.profileMethodVersion,
      queries: results,
    },
  };
}
