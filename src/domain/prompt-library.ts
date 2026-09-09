import type { CompanyProfile } from "./company-profile.ts";

export type PromptCategory =
  | "category-discovery"
  | "best-tools-platforms"
  | "alternatives"
  | "comparison"
  | "use-case-recommendation"
  | "buyer-intent";

export type PromptTemplateVersion =
  | "category@v1"
  | "service-area@v1"
  | "best-audience@v1"
  | "alternatives@v1"
  | "comparison-category@v1"
  | "use-case@v1"
  | "use-case-audience@v1"
  | "buyer@v1";

export type PromptEvidenceReference = Readonly<{
  field: keyof CompanyProfile["fields"];
  valueIndex: number;
  evidenceIndexes: readonly number[];
}>;

export type GeneratedPrompt = Readonly<{
  queryId: string;
  category: PromptCategory;
  text: string;
  templateVersion: PromptTemplateVersion;
  language: "en";
  locale: null;
  state: "planned";
  evidenceRefs: readonly PromptEvidenceReference[];
}>;

export type PromptGenerationResult =
  | Readonly<{
      ok: true;
      methodVersion: "niche-prompts-v1";
      profileMethodVersion: CompanyProfile["methodVersion"];
      prompts: readonly GeneratedPrompt[];
    }>
  | Readonly<{ ok: false; code: "invalid_profile" }>;

type Term = Readonly<{ text: string; ref: PromptEvidenceReference }>;

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/["'“”‘’]/g, "")
    .replace(/[-–—\s]+/gu, " ")
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
}

function terms(
  profile: CompanyProfile,
  field: keyof CompanyProfile["fields"],
  limit: number,
  excludedTerm?: Term,
): Term[] {
  const claim = profile.fields[field];
  if (claim.status !== "confirmed") return [];
  const seen = new Set<string>(
    excludedTerm ? [normalized(excludedTerm.text)] : [],
  );
  const selected: Term[] = [];
  for (const [valueIndex, value] of claim.values.entries()) {
    let text = value.value;
    if (field === "geography") {
      const match = /^Service area: *(.+)$/i.exec(text);
      if (!match?.[1]) continue;
      text = match[1];
    }
    // Omit unsuitable terms intact; never truncate a source claim into a new one.
    if (text.length > 200 || /[<>\p{Cc}\p{Cf}]/u.test(text)) continue;
    const key = normalized(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push({
      text,
      ref: {
        field,
        valueIndex,
        evidenceIndexes: value.evidence.map((_, index) => index),
      },
    });
    if (selected.length === limit) break;
  }
  return selected;
}

/** Internal pure rules; callers enter through generatePrompts for runtime validation. */
export function buildPromptCohort(
  profile: CompanyProfile,
): readonly GeneratedPrompt[] {
  const category = terms(profile, "industry", 1)[0];
  const product = terms(profile, "productName", 1)[0];
  const audience = terms(profile, "targetAudience", 1)[0];
  const prompts: GeneratedPrompt[] = [];
  const seen = new Set<string>();
  const quote = (term: Term): string => JSON.stringify(term.text);
  const add = (
    category: PromptCategory,
    templateVersion: PromptTemplateVersion,
    text: string,
    used: readonly Term[],
  ): void => {
    const key = normalized(text);
    if (prompts.length >= 10 || text.length > 600 || seen.has(key)) return;
    seen.add(key);
    prompts.push({
      queryId: `niche-prompts-v1:${encodeURIComponent(JSON.stringify([templateVersion, "en", null, text]))}`,
      category,
      text,
      templateVersion,
      language: "en",
      locale: null,
      state: "planned",
      evidenceRefs: used.map((term) => term.ref),
    });
  };
  if (category) {
    add(
      "category-discovery",
      "category@v1",
      `Which tools and platforms are available for ${quote(category)}?`,
      [category],
    );
    for (const area of terms(profile, "geography", 2))
      add(
        "category-discovery",
        "service-area@v1",
        `Which tools for ${quote(category)} are available in ${quote(area)}?`,
        [category, area],
      );
  }
  if (category && audience)
    add(
      "best-tools-platforms",
      "best-audience@v1",
      `What are the best tools for ${quote(category)} for ${quote(audience)}?`,
      [category, audience],
    );
  if (product)
    add(
      "alternatives",
      "alternatives@v1",
      `What are the best alternatives to ${quote(product)}?`,
      [product],
    );
  if (product && category)
    add(
      "comparison",
      "comparison-category@v1",
      `How does ${quote(product)} compare with other tools for ${quote(category)}?`,
      [product, category],
    );
  // A repeated category/use-case term would merely rephrase best-audience@v1.
  for (const useCase of terms(
    profile,
    "keyUseCases",
    3,
    audience ? category : undefined,
  )) {
    if (audience)
      add(
        "use-case-recommendation",
        "use-case-audience@v1",
        `What tools are best for ${quote(useCase)} for ${quote(audience)}?`,
        [useCase, audience],
      );
    else
      add(
        "use-case-recommendation",
        "use-case@v1",
        `What tools are best for ${quote(useCase)}?`,
        [useCase],
      );
  }
  if (category && audience)
    add(
      "buyer-intent",
      "buyer@v1",
      `What should ${quote(audience)} look for when choosing tools for ${quote(category)}?`,
      [audience, category],
    );
  return prompts;
}
