import {
  buildPromptCohort,
  type PromptGenerationResult,
} from "../domain/prompt-library.ts";
import { isCompanyProfile } from "./company-profile-validation.ts";

/** Accepts profile data only; structural validation is not independent source verification. */
export function generatePrompts(input: unknown): PromptGenerationResult {
  if (!isCompanyProfile(input)) return { ok: false, code: "invalid_profile" };
  return {
    ok: true,
    methodVersion: "niche-prompts-v1",
    profileMethodVersion: input.methodVersion,
    prompts: buildPromptCohort(input),
  };
}
