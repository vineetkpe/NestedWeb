export type PlanTier = "free_tier" | "agency_starter" | "agency_pro";

export type PlanEntitlements = Readonly<{
  tier: PlanTier;
  name: string;
  description: string;
  maxProjects: number;
  maxScansPerMonth: number;
  maxQueriesPerScan: number;
  maxConcurrentScans: number;
  monthlyBudgetMicrounits: bigint;
}>;

export type ProjectEntitlementDecision =
  | Readonly<{
      allowed: true;
      remainingProjects: number;
    }>
  | Readonly<{
      allowed: false;
      reason: "project_limit_reached";
      maxProjects: number;
      currentCount: number;
    }>;

export type ScanEntitlementDecision =
  | Readonly<{
      allowed: true;
      remainingScansThisMonth: number;
    }>
  | Readonly<{
      allowed: false;
      reason:
        | "monthly_scan_quota_exhausted"
        | "concurrency_exhausted"
        | "query_limit_exceeded";
      limit: number;
    }>;

export type UsageQuotaSummary = Readonly<{
  tier: PlanTier;
  planName: string;
  projects: Readonly<{
    used: number;
    max: number;
    remaining: number;
    exhausted: boolean;
  }>;
  scans: Readonly<{
    usedThisMonth: number;
    maxPerMonth: number;
    remainingThisMonth: number;
    exhausted: boolean;
  }>;
  concurrency: Readonly<{
    active: number;
    max: number;
    available: number;
  }>;
}>;

const PLAN_CATALOG: Readonly<Record<PlanTier, PlanEntitlements>> =
  Object.freeze({
    free_tier: Object.freeze({
      tier: "free_tier" as const,
      name: "Free Pilot",
      description: "For single-brand evaluation and trial scans",
      maxProjects: 1,
      maxScansPerMonth: 5,
      maxQueriesPerScan: 5,
      maxConcurrentScans: 1,
      monthlyBudgetMicrounits: 10_000_000n,
    }),
    agency_starter: Object.freeze({
      tier: "agency_starter" as const,
      name: "Agency Starter",
      description:
        "For boutique SEO/GEO agencies managing up to 5 client brands",
      maxProjects: 5,
      maxScansPerMonth: 50,
      maxQueriesPerScan: 10,
      maxConcurrentScans: 2,
      monthlyBudgetMicrounits: 100_000_000n,
    }),
    agency_pro: Object.freeze({
      tier: "agency_pro" as const,
      name: "Agency Pro",
      description:
        "For scaling agencies running continuous multi-brand visibility monitoring",
      maxProjects: 25,
      maxScansPerMonth: 250,
      maxQueriesPerScan: 10,
      maxConcurrentScans: 5,
      monthlyBudgetMicrounits: 500_000_000n,
    }),
  });

export function isPlanTier(value: unknown): value is PlanTier {
  return (
    typeof value === "string" &&
    (value === "free_tier" ||
      value === "agency_starter" ||
      value === "agency_pro")
  );
}

/**
 * Returns the entitlements for the requested tier. Defaults fail-closed to `free_tier`
 * if an unknown or invalid tier is provided.
 */
export function getPlanEntitlements(tier: unknown): PlanEntitlements {
  if (isPlanTier(tier)) {
    return PLAN_CATALOG[tier];
  }
  return PLAN_CATALOG.free_tier;
}

/**
 * Pure deterministic check whether a new project can be created under the given plan tier.
 */
export function checkProjectCreationEntitlement(
  tier: PlanTier,
  currentProjectCount: number,
): ProjectEntitlementDecision {
  const entitlements = getPlanEntitlements(tier);
  const normalizedCount = Math.max(0, Math.floor(currentProjectCount));

  if (normalizedCount >= entitlements.maxProjects) {
    return Object.freeze({
      allowed: false as const,
      reason: "project_limit_reached" as const,
      maxProjects: entitlements.maxProjects,
      currentCount: normalizedCount,
    });
  }

  return Object.freeze({
    allowed: true as const,
    remainingProjects: entitlements.maxProjects - normalizedCount - 1,
  });
}

/**
 * Pure deterministic check whether a new scan can be executed under the given plan tier.
 */
export function checkScanExecutionEntitlement(
  tier: PlanTier,
  usage: Readonly<{
    monthScans: number;
    activeScans: number;
    requestedQueries: number;
  }>,
): ScanEntitlementDecision {
  const entitlements = getPlanEntitlements(tier);
  const normalizedMonthScans = Math.max(0, Math.floor(usage.monthScans));
  const normalizedActiveScans = Math.max(0, Math.floor(usage.activeScans));
  const normalizedQueries = Math.max(0, Math.floor(usage.requestedQueries));

  if (normalizedQueries > entitlements.maxQueriesPerScan) {
    return Object.freeze({
      allowed: false as const,
      reason: "query_limit_exceeded" as const,
      limit: entitlements.maxQueriesPerScan,
    });
  }

  if (normalizedActiveScans >= entitlements.maxConcurrentScans) {
    return Object.freeze({
      allowed: false as const,
      reason: "concurrency_exhausted" as const,
      limit: entitlements.maxConcurrentScans,
    });
  }

  if (normalizedMonthScans >= entitlements.maxScansPerMonth) {
    return Object.freeze({
      allowed: false as const,
      reason: "monthly_scan_quota_exhausted" as const,
      limit: entitlements.maxScansPerMonth,
    });
  }

  return Object.freeze({
    allowed: true as const,
    remainingScansThisMonth:
      entitlements.maxScansPerMonth - normalizedMonthScans - 1,
  });
}

/**
 * Pure calculation of workspace quota summary for account and dashboard presentation.
 */
export function calculateUsageQuota(
  tier: PlanTier,
  usage: Readonly<{
    projectCount: number;
    monthScans: number;
    activeScans: number;
  }>,
): UsageQuotaSummary {
  const entitlements = getPlanEntitlements(tier);
  const projectCount = Math.max(0, Math.floor(usage.projectCount));
  const monthScans = Math.max(0, Math.floor(usage.monthScans));
  const activeScans = Math.max(0, Math.floor(usage.activeScans));

  const remainingProjects = Math.max(
    0,
    entitlements.maxProjects - projectCount,
  );
  const remainingScans = Math.max(
    0,
    entitlements.maxScansPerMonth - monthScans,
  );
  const availableConcurrency = Math.max(
    0,
    entitlements.maxConcurrentScans - activeScans,
  );

  return Object.freeze({
    tier: entitlements.tier,
    planName: entitlements.name,
    projects: Object.freeze({
      used: projectCount,
      max: entitlements.maxProjects,
      remaining: remainingProjects,
      exhausted: projectCount >= entitlements.maxProjects,
    }),
    scans: Object.freeze({
      usedThisMonth: monthScans,
      maxPerMonth: entitlements.maxScansPerMonth,
      remainingThisMonth: remainingScans,
      exhausted: monthScans >= entitlements.maxScansPerMonth,
    }),
    concurrency: Object.freeze({
      active: activeScans,
      max: entitlements.maxConcurrentScans,
      available: availableConcurrency,
    }),
  });
}
