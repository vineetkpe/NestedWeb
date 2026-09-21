import { createHash } from "node:crypto";

export type CustomerActionCategory =
  "comparison_defense" | "citation_building" | "content_expansion";

export type CustomerActionImpact = "high" | "medium" | "low";

export type CustomerAction = Readonly<{
  actionId: string;
  category: CustomerActionCategory;
  impact: CustomerActionImpact;
  title: string;
  rationale: string;
  supportingQueryIds: readonly string[];
  targetEntity: string;
}>;

export type CustomerActionInputObservation = Readonly<{
  queryId: string;
  queryText: string;
  targetBrandMentioned: boolean;
  targetBrandRecommended: boolean;
  competitorMentions: readonly Readonly<{
    name: string;
    recommended: boolean;
  }>[];
  citedDomains: readonly string[];
}>;

export type GenerateCustomerActionsInput = Readonly<{
  targetBrandName: string;
  trackedDomain: string;
  observations: readonly CustomerActionInputObservation[];
}>;

function hashActionId(
  category: string,
  target: string,
  queryIds: readonly string[],
): string {
  const sortedQueries = [...queryIds].sort().join(",");
  const payload = `action-v1:${category}:${target}:${sortedQueries}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

const IMPACT_ORDER: Readonly<Record<CustomerActionImpact, number>> =
  Object.freeze({
    high: 3,
    medium: 2,
    low: 1,
  });

/**
 * Pure deterministic generation of customer action proposals (customer-actions-v1).
 * Translates observed AI answer evidence into prioritized, traceable actions.
 */
export function generateCustomerActions(
  input: GenerateCustomerActionsInput,
): readonly CustomerAction[] {
  const targetBrand = input.targetBrandName.trim();
  const trackedDomain = input.trackedDomain.toLowerCase().trim();

  if (targetBrand.length === 0 || input.observations.length === 0) {
    return Object.freeze([]);
  }

  const actions: CustomerAction[] = [];

  // 1. Comparison Defense: Competitor was explicitly recommended, target was not
  const competitorRecommendationQueries = new Map<
    string,
    { competitorName: string; queryIds: Set<string>; sampleQuery: string }
  >();

  for (const obs of input.observations) {
    if (obs.targetBrandRecommended) continue;

    for (const comp of obs.competitorMentions) {
      if (comp.recommended) {
        const key = comp.name.toLowerCase().trim();
        const existing = competitorRecommendationQueries.get(key);
        if (existing) {
          existing.queryIds.add(obs.queryId);
        } else {
          competitorRecommendationQueries.set(key, {
            competitorName: comp.name,
            queryIds: new Set([obs.queryId]),
            sampleQuery: obs.queryText,
          });
        }
      }
    }
  }

  for (const record of competitorRecommendationQueries.values()) {
    const queryIds = Array.from(record.queryIds).sort();
    const queryCount = queryIds.length;
    const impact: CustomerActionImpact = queryCount >= 2 ? "high" : "medium";

    actions.push(
      Object.freeze({
        actionId: hashActionId(
          "comparison_defense",
          record.competitorName,
          queryIds,
        ),
        category: "comparison_defense" as const,
        impact,
        title: `Defend comparison queries against ${record.competitorName}`,
        rationale: `${record.competitorName} was explicitly recommended in ${queryCount} AI answer${queryCount === 1 ? "" : "s"} (including "${record.sampleQuery}"), while ${targetBrand} was not endorsed. Target comparative content and product differentiators.`,
        supportingQueryIds: Object.freeze(queryIds),
        targetEntity: record.competitorName,
      }),
    );
  }

  // 2. Citation Building: External domains cited in AI answers where client's domain was missing
  const externalDomainCitations = new Map<string, Set<string>>();

  for (const obs of input.observations) {
    const clientDomainCited = obs.citedDomains.some(
      (d) =>
        d.toLowerCase() === trackedDomain ||
        d.toLowerCase().endsWith(`.${trackedDomain}`),
    );

    if (!clientDomainCited) {
      for (const rawDomain of obs.citedDomains) {
        const domain = rawDomain.toLowerCase().trim();
        if (
          domain.length === 0 ||
          domain === trackedDomain ||
          domain.endsWith(`.${trackedDomain}`)
        ) {
          continue;
        }
        const existing = externalDomainCitations.get(domain);
        if (existing) {
          existing.add(obs.queryId);
        } else {
          externalDomainCitations.set(domain, new Set([obs.queryId]));
        }
      }
    }
  }

  for (const [domain, querySet] of externalDomainCitations) {
    const queryIds = Array.from(querySet).sort();
    const citationCount = queryIds.length;
    // Only recommend domains cited in at least 2 distinct queries or at least 1 if total observations is small
    if (
      citationCount >= 2 ||
      (input.observations.length <= 3 && citationCount >= 1)
    ) {
      const impact: CustomerActionImpact =
        citationCount >= 3 ? "high" : "medium";
      actions.push(
        Object.freeze({
          actionId: hashActionId("citation_building", domain, queryIds),
          category: "citation_building" as const,
          impact,
          title: `Build citation presence on ${domain}`,
          rationale: `${domain} was cited in ${citationCount} AI answer${citationCount === 1 ? "" : "s"} where ${trackedDomain} was absent. Earning mentions or directory listings on this source can directly improve AI grounding visibility.`,
          supportingQueryIds: Object.freeze(queryIds),
          targetEntity: domain,
        }),
      );
    }
  }

  // 3. Content Expansion: High-intent queries where target brand was not mentioned at all
  const unmentionedQueries: CustomerActionInputObservation[] = [];
  for (const obs of input.observations) {
    if (!obs.targetBrandMentioned) {
      unmentionedQueries.push(obs);
    }
  }

  // Group unmentioned queries or take top opportunities (up to 3)
  for (const obs of unmentionedQueries.slice(0, 3)) {
    actions.push(
      Object.freeze({
        actionId: hashActionId("content_expansion", obs.queryId, [obs.queryId]),
        category: "content_expansion" as const,
        impact: "medium" as const,
        title: `Publish targeted content for "${obs.queryText}"`,
        rationale: `The AI answer for this query did not mention ${targetBrand}. Creating dedicated, authoritative content that directly answers this question will increase retrieval likelihood.`,
        supportingQueryIds: Object.freeze([obs.queryId]),
        targetEntity: obs.queryText,
      }),
    );
  }

  // Sort actions: impact descending, then supporting queries count descending, then actionId
  actions.sort((a, b) => {
    const impactDiff = IMPACT_ORDER[b.impact] - IMPACT_ORDER[a.impact];
    if (impactDiff !== 0) return impactDiff;

    const queriesDiff =
      b.supportingQueryIds.length - a.supportingQueryIds.length;
    if (queriesDiff !== 0) return queriesDiff;

    return a.actionId.localeCompare(b.actionId);
  });

  return Object.freeze(actions.slice(0, 10));
}
