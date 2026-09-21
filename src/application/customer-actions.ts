import {
  generateCustomerActions,
  type CustomerAction,
  type CustomerActionInputObservation,
} from "../domain/customer-actions.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GenerateScanCustomerActionsRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  targetBrandName: unknown;
  trackedDomain: unknown;
  observations: unknown;
}>;

export type GenerateScanCustomerActionsResult =
  | Readonly<{
      ok: true;
      actions: readonly CustomerAction[];
    }>
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "invalid_project_id"
        | "invalid_brand_name"
        | "invalid_tracked_domain"
        | "invalid_observations";
    }>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function parseObservation(
  value: unknown,
): CustomerActionInputObservation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;

  if (typeof obj.queryId !== "string" || obj.queryId.length === 0) return null;
  if (typeof obj.queryText !== "string" || obj.queryText.length === 0)
    return null;
  if (typeof obj.targetBrandMentioned !== "boolean") return null;
  if (typeof obj.targetBrandRecommended !== "boolean") return null;

  if (!Array.isArray(obj.competitorMentions)) return null;
  const competitors: { name: string; recommended: boolean }[] = [];
  for (const item of obj.competitorMentions) {
    if (typeof item !== "object" || item === null) return null;
    const c = item as Record<string, unknown>;
    if (typeof c.name !== "string" || c.name.length === 0) return null;
    if (typeof c.recommended !== "boolean") return null;
    competitors.push({ name: c.name, recommended: c.recommended });
  }

  if (!Array.isArray(obj.citedDomains)) return null;
  const citedDomains: string[] = [];
  for (const d of obj.citedDomains) {
    if (typeof d !== "string") return null;
    citedDomains.push(d);
  }

  return Object.freeze({
    queryId: obj.queryId,
    queryText: obj.queryText,
    targetBrandMentioned: obj.targetBrandMentioned,
    targetBrandRecommended: obj.targetBrandRecommended,
    competitorMentions: Object.freeze(competitors.map((c) => Object.freeze(c))),
    citedDomains: Object.freeze(citedDomains),
  });
}

/**
 * Orchestrates customer action recommendation proposals across verified scan observations.
 */
export function generateScanCustomerActions(
  request: GenerateScanCustomerActionsRequest,
): GenerateScanCustomerActionsResult {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) {
    return Object.freeze({ ok: false, code: "invalid_workspace_id" });
  }

  const projectId = normalizeUuid(request.projectId);
  if (projectId === null) {
    return Object.freeze({ ok: false, code: "invalid_project_id" });
  }

  if (
    typeof request.targetBrandName !== "string" ||
    request.targetBrandName.trim().length === 0
  ) {
    return Object.freeze({ ok: false, code: "invalid_brand_name" });
  }

  if (
    typeof request.trackedDomain !== "string" ||
    request.trackedDomain.trim().length === 0
  ) {
    return Object.freeze({ ok: false, code: "invalid_tracked_domain" });
  }

  if (!Array.isArray(request.observations)) {
    return Object.freeze({ ok: false, code: "invalid_observations" });
  }

  const parsedObservations: CustomerActionInputObservation[] = [];
  for (const raw of request.observations) {
    const parsed = parseObservation(raw);
    if (parsed === null) {
      return Object.freeze({ ok: false, code: "invalid_observations" });
    }
    parsedObservations.push(parsed);
  }

  const actions = generateCustomerActions({
    targetBrandName: request.targetBrandName.trim(),
    trackedDomain: request.trackedDomain.trim(),
    observations: parsedObservations,
  });

  return Object.freeze({
    ok: true,
    actions,
  });
}
