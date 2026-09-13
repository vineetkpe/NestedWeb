import {
  persistCompanyProfile,
  type CompanyProfilePersistenceGateway,
  type PersistCompanyProfileResult,
  type PersistCompanyProfileSuccess,
} from "./company-profile-persistence.ts";
import {
  persistPromptCohort,
  type PersistPromptCohortResult,
  type PromptCohortPersistenceGateway,
  type PromptCohortSnapshotSummary,
} from "./prompt-cohort-persistence.ts";

export type PersistProfilePromptCohortRequest = Readonly<{
  workspaceId: unknown;
  projectId: unknown;
  profileIdempotencyKey: unknown;
  promptCohortIdempotencyKey: unknown;
  capturedAt: unknown;
  crawlResult: unknown;
}>;

export type PersistProfilePromptCohortResult =
  | Readonly<{
      ok: true;
      profile: PersistCompanyProfileSuccess;
      cohort: PromptCohortSnapshotSummary;
    }>
  | Readonly<{
      ok: false;
      stage: "profile";
      failure: Exclude<PersistCompanyProfileResult, { ok: true }>;
    }>
  | Readonly<{
      ok: false;
      stage: "prompt_cohort";
      failure: Exclude<PersistPromptCohortResult, { ok: true }>;
    }>;

/**
 * Composes the existing durable profile and prompt-cohort boundaries without
 * introducing another canonical representation. Prompt persistence receives
 * the exact CompanyProfile object returned by profile persistence and the exact
 * durable snapshot ID produced for that same profile.
 */
export async function persistProfilePromptCohort(
  request: PersistProfilePromptCohortRequest,
  profileGateway: CompanyProfilePersistenceGateway,
  promptGateway: PromptCohortPersistenceGateway,
): Promise<PersistProfilePromptCohortResult> {
  const profile = await persistCompanyProfile(
    {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      idempotencyKey: request.profileIdempotencyKey,
      capturedAt: request.capturedAt,
      crawlResult: request.crawlResult,
    },
    profileGateway,
  );
  if (!profile.ok) {
    return Object.freeze({
      ok: false,
      stage: "profile",
      failure: profile,
    });
  }

  const cohort = await persistPromptCohort(
    {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      profileSnapshotId: profile.snapshot.snapshotId,
      idempotencyKey: request.promptCohortIdempotencyKey,
      profile: profile.profile,
    },
    promptGateway,
  );
  if (!cohort.ok) {
    return Object.freeze({
      ok: false,
      stage: "prompt_cohort",
      failure: cohort,
    });
  }

  return Object.freeze({
    ok: true,
    profile,
    cohort: cohort.cohort,
  });
}
