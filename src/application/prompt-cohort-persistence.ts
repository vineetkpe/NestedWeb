import { generatePrompts } from "./prompt-generation.ts";
import type { GeneratedPrompt } from "../domain/prompt-library.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PersistPromptCohortRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  profileSnapshotId: unknown;
  idempotencyKey: unknown;
  profile: unknown;
}>;

export type ValidatedPromptCohortPersistenceRequest = Readonly<{
  workspaceId: string;
  projectId: string;
  profileSnapshotId: string;
  idempotencyKey: string;
  profile: unknown;
  promptMethodVersion: "niche-prompts-v1";
  profileMethodVersion: "company-profile-v2";
  language: "en";
  locale: null;
  prompts: readonly GeneratedPrompt[];
}>;

export type PromptCohortSnapshotSummary = Readonly<{
  cohortId: string;
  profileSnapshotId: string;
  requestFingerprint: string;
  queryCount: number;
  replayed: boolean;
}>;

export type PromptCohortPersistenceGatewayFailureCode =
  | "profile_snapshot_not_found"
  | "profile_snapshot_mismatch"
  | "idempotency_conflict"
  | "database_error"
  | "invalid_database_response";

export type PromptCohortPersistenceGatewayResult =
  | Readonly<{ ok: true; cohort: PromptCohortSnapshotSummary }>
  | Readonly<{
      ok: false;
      code: PromptCohortPersistenceGatewayFailureCode;
    }>;

export type PromptCohortPersistenceGateway = (
  request: ValidatedPromptCohortPersistenceRequest,
) => Promise<PromptCohortPersistenceGatewayResult>;

export type PersistPromptCohortResult =
  | PromptCohortPersistenceGatewayResult
  | Readonly<{
      ok: false;
      code:
        | "invalid_workspace_id"
        | "invalid_project_id"
        | "invalid_profile_snapshot_id"
        | "invalid_idempotency_key"
        | "invalid_profile";
    }>;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim() || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function snapshotPrompt(prompt: GeneratedPrompt): GeneratedPrompt {
  return Object.freeze({
    queryId: prompt.queryId,
    category: prompt.category,
    text: prompt.text,
    templateVersion: prompt.templateVersion,
    language: prompt.language,
    locale: prompt.locale,
    state: prompt.state,
    evidenceRefs: Object.freeze(
      prompt.evidenceRefs.map((reference) =>
        Object.freeze({
          field: reference.field,
          valueIndex: reference.valueIndex,
          evidenceIndexes: Object.freeze([...reference.evidenceIndexes]),
        }),
      ),
    ),
  });
}

/**
 * Recomputes the deterministic prompt cohort from the supplied exact C5 profile
 * snapshot. Callers never provide prompts independently of their source profile.
 * The persistence gateway/DB additionally verifies that `profile` is the exact
 * payload stored under `profileSnapshotId` before accepting the cohort.
 */
export async function persistPromptCohort(
  request: PersistPromptCohortRequest,
  gateway: PromptCohortPersistenceGateway,
): Promise<PersistPromptCohortResult> {
  const workspaceId = normalizeUuid(request.workspaceId);
  if (workspaceId === null) return { ok: false, code: "invalid_workspace_id" };

  const projectId = normalizeUuid(request.projectId);
  if (projectId === null) return { ok: false, code: "invalid_project_id" };

  const profileSnapshotId = normalizeUuid(request.profileSnapshotId);
  if (profileSnapshotId === null)
    return { ok: false, code: "invalid_profile_snapshot_id" };

  const idempotencyKey = normalizeUuid(request.idempotencyKey);
  if (idempotencyKey === null)
    return { ok: false, code: "invalid_idempotency_key" };

  const generated = generatePrompts(request.profile);
  if (!generated.ok) return { ok: false, code: "invalid_profile" };

  const prompts = Object.freeze(generated.prompts.map(snapshotPrompt));
  return gateway(
    Object.freeze({
      workspaceId,
      projectId,
      profileSnapshotId,
      idempotencyKey,
      profile: request.profile,
      promptMethodVersion: generated.methodVersion,
      profileMethodVersion: generated.profileMethodVersion,
      language: "en",
      locale: null,
      prompts,
    }),
  );
}
