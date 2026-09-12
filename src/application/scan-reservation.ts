import type {
  PromptCategory,
  PromptTemplateVersion,
} from "../domain/prompt-library.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const templateCategories: Readonly<
  Record<PromptTemplateVersion, PromptCategory>
> = Object.freeze({
  "category@v1": "category-discovery",
  "service-area@v1": "category-discovery",
  "best-audience@v1": "best-tools-platforms",
  "alternatives@v1": "alternatives",
  "comparison-category@v1": "comparison",
  "use-case@v1": "use-case-recommendation",
  "use-case-audience@v1": "use-case-recommendation",
  "buyer@v1": "buyer-intent",
});

const profileFields = new Set([
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

export type ReserveScanRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  idempotencyKey: unknown;
  promptGeneration: unknown;
}>;

export type ReservedScanQuery = Readonly<{
  queryId: string;
  queryVersion: PromptTemplateVersion;
  queryText: string;
}>;

export type ValidatedReserveScanRequest = Readonly<{
  workspaceId: string;
  projectId: string;
  idempotencyKey: string;
  promptMethodVersion: "niche-prompts-v1";
  profileMethodVersion: "company-profile-v2";
  queries: readonly ReservedScanQuery[];
}>;

export type ScanReservationSummary = Readonly<{
  scanId: string;
  reservationId: string;
  reservedMicrounits: string;
  currency: string;
  provider: "gemini";
  modelId: string;
  priceVersion: string;
  maxAttempts: number;
  maxOutputTokens: number;
  requestFingerprint: string;
  replayed: boolean;
}>;

export type ScanReservationGatewayFailureCode =
  | "authorization_denied"
  | "idempotency_conflict"
  | "execution_unavailable"
  | "query_limit_exceeded"
  | "concurrency_exhausted"
  | "request_limit_exhausted"
  | "budget_exhausted"
  | "database_error"
  | "invalid_database_response";

export type ScanReservationGatewayResult =
  | Readonly<{ ok: true; reservation: ScanReservationSummary }>
  | Readonly<{ ok: false; code: ScanReservationGatewayFailureCode }>;

export type ReserveScanResult =
  | ScanReservationGatewayResult
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "invalid_project_id"
        | "invalid_idempotency_key"
        | "invalid_prompt_cohort"
        | "too_many_prompts";
    }>;

export type ScanReservationGateway = (
  request: ValidatedReserveScanRequest,
) => Promise<ScanReservationGatewayResult>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function boundedInteger(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= max
  );
}

function boundedText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    value.trim().length > 0 &&
    value.isWellFormed()
  );
}

function templateVersion(value: unknown): value is PromptTemplateVersion {
  return typeof value === "string" && Object.hasOwn(templateCategories, value);
}

function expectedQueryId(version: PromptTemplateVersion, text: string): string {
  return `niche-prompts-v1:${encodeURIComponent(
    JSON.stringify([version, "en", null, text]),
  )}`;
}

function validEvidenceReference(value: unknown): boolean {
  if (
    !record(value) ||
    typeof value.field !== "string" ||
    !profileFields.has(value.field) ||
    !boundedInteger(value.valueIndex, 199) ||
    !Array.isArray(value.evidenceIndexes) ||
    value.evidenceIndexes.length === 0 ||
    value.evidenceIndexes.length > 200
  )
    return false;

  const seen = new Set<number>();
  for (const index of value.evidenceIndexes) {
    if (!boundedInteger(index, 199) || seen.has(index)) return false;
    seen.add(index);
  }
  return true;
}

function snapshotQuery(value: unknown): ReservedScanQuery | null {
  if (
    !record(value) ||
    !templateVersion(value.templateVersion) ||
    typeof value.category !== "string" ||
    value.category !== templateCategories[value.templateVersion] ||
    value.language !== "en" ||
    value.locale !== null ||
    value.state !== "planned" ||
    !boundedText(value.text, 600) ||
    !boundedText(value.queryId, 8192) ||
    value.queryId !== expectedQueryId(value.templateVersion, value.text) ||
    !Array.isArray(value.evidenceRefs) ||
    value.evidenceRefs.length === 0 ||
    value.evidenceRefs.length > 2 ||
    !value.evidenceRefs.every(validEvidenceReference)
  )
    return null;

  return Object.freeze({
    queryId: value.queryId,
    queryVersion: value.templateVersion,
    queryText: value.text,
  });
}

function snapshotPromptGeneration(value: unknown):
  | Readonly<{
      ok: true;
      queries: readonly ReservedScanQuery[];
    }>
  | Readonly<{
      ok: false;
      code: "invalid_prompt_cohort" | "too_many_prompts";
    }> {
  if (
    !record(value) ||
    value.ok !== true ||
    value.methodVersion !== "niche-prompts-v1" ||
    value.profileMethodVersion !== "company-profile-v2" ||
    !Array.isArray(value.prompts) ||
    value.prompts.length === 0
  )
    return { ok: false, code: "invalid_prompt_cohort" };
  if (value.prompts.length > 10)
    return { ok: false, code: "too_many_prompts" };

  const queries: ReservedScanQuery[] = [];
  const queryIds = new Set<string>();
  for (const prompt of value.prompts) {
    const query = snapshotQuery(prompt);
    if (query === null || queryIds.has(query.queryId))
      return { ok: false, code: "invalid_prompt_cohort" };
    queryIds.add(query.queryId);
    queries.push(query);
  }

  return { ok: true, queries: Object.freeze(queries) };
}

/**
 * Validates and snapshots only reservation-relevant prompt identity. Provider,
 * price, budget and execution limits are resolved atomically by the database;
 * caller-supplied values for those concerns are never forwarded.
 */
export async function reserveScan(
  request: ReserveScanRequest,
  gateway: ScanReservationGateway,
): Promise<ReserveScanResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) return { ok: false, code: "invalid_workspace_id" };

  const projectId = normalizeUuid(request.projectId);
  if (projectId === null) return { ok: false, code: "invalid_project_id" };

  const idempotencyKey = normalizeUuid(request.idempotencyKey);
  if (idempotencyKey === null)
    return { ok: false, code: "invalid_idempotency_key" };

  const promptGeneration = snapshotPromptGeneration(request.promptGeneration);
  if (!promptGeneration.ok) return promptGeneration;

  return gateway(
    Object.freeze({
      workspaceId,
      projectId,
      idempotencyKey,
      promptMethodVersion: "niche-prompts-v1",
      profileMethodVersion: "company-profile-v2",
      queries: promptGeneration.queries,
    }),
  );
}
