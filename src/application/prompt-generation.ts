import type {
  CompanyProfile,
  ProfileEvidence,
  ProfileField,
} from "../domain/company-profile.ts";
import {
  buildPromptCohort,
  type PromptGenerationResult,
} from "../domain/prompt-library.ts";
import { normalizeWebsite } from "../domain/website.ts";

const fieldNames = [
  "companyName",
  "productName",
  "shortDescription",
  "primaryProduct",
  "targetAudience",
  "industry",
  "keyUseCases",
  "capabilities",
  "geography",
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= max
  );
}

function evidence(value: unknown): value is ProfileEvidence {
  if (
    !record(value) ||
    !integer(value.pageIndex, 19) ||
    value.contentField !== "markdown" ||
    !integer(value.start, 2 * 1024 * 1024) ||
    !integer(value.end, 2 * 1024 * 1024) ||
    typeof value.quote !== "string" ||
    value.quote.length === 0 ||
    value.quote.length > 2000 ||
    value.end - value.start !== value.quote.length ||
    typeof value.pageUrl !== "string" ||
    value.pageUrl.length > 8192 ||
    !value.pageUrl.startsWith("https://") ||
    /[<>]/.test(value.pageUrl)
  )
    return false;
  const website = normalizeWebsite(value.pageUrl);
  return website.ok && new URL(value.pageUrl).origin === website.value.origin;
}

function profileField(
  value: unknown,
  name: keyof CompanyProfile["fields"],
  budget: { evidence: number },
): value is ProfileField {
  if (!record(value)) return false;
  if (value.status === "unknown")
    return (
      value.reason === "no_supported_statement" &&
      !Object.hasOwn(value, "values")
    );
  if (
    (value.status !== "confirmed" && value.status !== "conflicting") ||
    !Array.isArray(value.values) ||
    value.values.length === 0 ||
    value.values.length > 200
  )
    return false;
  const collection =
    name === "keyUseCases" || name === "capabilities" || name === "geography";
  if (value.status === "confirmed" && !collection && value.values.length !== 1)
    return false;
  if (
    value.status === "conflicting" &&
    (value.values.length < 2 ||
      name === "keyUseCases" ||
      name === "capabilities")
  )
    return false;
  for (const claim of value.values) {
    if (
      !record(claim) ||
      typeof claim.value !== "string" ||
      claim.value.length > 2000 ||
      claim.value.trim().length === 0 ||
      !claim.value.isWellFormed() ||
      !Array.isArray(claim.evidence) ||
      claim.evidence.length === 0
    )
      return false;
    budget.evidence -= claim.evidence.length;
    // Bound total validation work before visiting evidence strings or parsing URLs.
    if (budget.evidence < 0) return false;
    for (const ref of claim.evidence) if (!evidence(ref)) return false;
  }
  return true;
}

function companyProfile(input: unknown): input is CompanyProfile {
  if (
    !record(input) ||
    input.methodVersion !== "company-profile-v2" ||
    !record(input.fields) ||
    !Array.isArray(input.excludedPages) ||
    input.excludedPages.length > 20
  )
    return false;
  const excluded = new Set<number>();
  for (const page of input.excludedPages) {
    if (
      !record(page) ||
      !integer(page.pageIndex, 19) ||
      excluded.has(page.pageIndex) ||
      (page.reason !== "http_error" && page.reason !== "unsupported_markup")
    )
      return false;
    excluded.add(page.pageIndex);
  }
  const budget = { evidence: 200 };
  let origin: string | undefined;
  const pageUrls = new Map<number, string>();
  for (const name of fieldNames) {
    const field = input.fields[name];
    if (!profileField(field, name, budget)) return false;
    if (field.status === "unknown") continue;
    for (const claim of field.values) {
      for (const ref of claim.evidence) {
        const pageOrigin = new URL(ref.pageUrl).origin;
        const pageUrl = pageUrls.get(ref.pageIndex);
        if (
          excluded.has(ref.pageIndex) ||
          (origin !== undefined && origin !== pageOrigin) ||
          (pageUrl !== undefined && pageUrl !== ref.pageUrl)
        )
          return false;
        origin = pageOrigin;
        pageUrls.set(ref.pageIndex, ref.pageUrl);
      }
    }
  }
  return true;
}

/** Accepts profile data only; structural validation is not independent source verification. */
export function generatePrompts(input: unknown): PromptGenerationResult {
  if (!companyProfile(input)) return { ok: false, code: "invalid_profile" };
  return {
    ok: true,
    methodVersion: "niche-prompts-v1",
    profileMethodVersion: input.methodVersion,
    prompts: buildPromptCohort(input),
  };
}
