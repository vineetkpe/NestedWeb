import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateUsageQuota,
  checkProjectCreationEntitlement,
  checkScanExecutionEntitlement,
  getPlanEntitlements,
  isPlanTier,
} from "./plan-entitlements.ts";

test("isPlanTier validates exact plan tiers and rejects arbitrary inputs", () => {
  assert.equal(isPlanTier("free_tier"), true);
  assert.equal(isPlanTier("agency_starter"), true);
  assert.equal(isPlanTier("agency_pro"), true);

  assert.equal(isPlanTier("enterprise"), false);
  assert.equal(isPlanTier(""), false);
  assert.equal(isPlanTier(null), false);
  assert.equal(isPlanTier(undefined), false);
  assert.equal(isPlanTier(123), false);
  assert.equal(isPlanTier({ tier: "free_tier" }), false);
});

test("getPlanEntitlements returns accurate catalog and fails closed to free_tier", () => {
  const free = getPlanEntitlements("free_tier");
  assert.equal(free.tier, "free_tier");
  assert.equal(free.name, "Free Pilot");
  assert.equal(free.maxProjects, 1);
  assert.equal(free.maxScansPerMonth, 5);
  assert.equal(free.maxQueriesPerScan, 5);
  assert.equal(free.maxConcurrentScans, 1);
  assert.equal(free.monthlyBudgetMicrounits, 10_000_000n);

  const starter = getPlanEntitlements("agency_starter");
  assert.equal(starter.tier, "agency_starter");
  assert.equal(starter.name, "Agency Starter");
  assert.equal(starter.maxProjects, 5);
  assert.equal(starter.maxScansPerMonth, 50);
  assert.equal(starter.maxQueriesPerScan, 10);
  assert.equal(starter.maxConcurrentScans, 2);
  assert.equal(starter.monthlyBudgetMicrounits, 100_000_000n);

  const pro = getPlanEntitlements("agency_pro");
  assert.equal(pro.tier, "agency_pro");
  assert.equal(pro.name, "Agency Pro");
  assert.equal(pro.maxProjects, 25);
  assert.equal(pro.maxScansPerMonth, 250);
  assert.equal(pro.maxQueriesPerScan, 10);
  assert.equal(pro.maxConcurrentScans, 5);
  assert.equal(pro.monthlyBudgetMicrounits, 500_000_000n);

  const fallback = getPlanEntitlements("unknown_plan_name");
  assert.equal(fallback.tier, "free_tier");
  assert.equal(fallback.maxProjects, 1);
});

test("checkProjectCreationEntitlement enforces project limits strictly", () => {
  // Free tier (max 1 project)
  const freeZero = checkProjectCreationEntitlement("free_tier", 0);
  assert.equal(freeZero.allowed, true);
  if (freeZero.allowed) {
    assert.equal(freeZero.remainingProjects, 0);
  }

  const freeOne = checkProjectCreationEntitlement("free_tier", 1);
  assert.equal(freeOne.allowed, false);
  if (!freeOne.allowed) {
    assert.equal(freeOne.reason, "project_limit_reached");
    assert.equal(freeOne.maxProjects, 1);
    assert.equal(freeOne.currentCount, 1);
  }

  // Agency starter (max 5 projects)
  const starterThree = checkProjectCreationEntitlement("agency_starter", 3);
  assert.equal(starterThree.allowed, true);
  if (starterThree.allowed) {
    assert.equal(starterThree.remainingProjects, 1);
  }

  const starterFive = checkProjectCreationEntitlement("agency_starter", 5);
  assert.equal(starterFive.allowed, false);
  if (!starterFive.allowed) {
    assert.equal(starterFive.reason, "project_limit_reached");
    assert.equal(starterFive.maxProjects, 5);
  }

  // Safely normalizes negative or float inputs
  const freeNegative = checkProjectCreationEntitlement("free_tier", -2);
  assert.equal(freeNegative.allowed, true);
});

test("checkScanExecutionEntitlement enforces scan limits, concurrency, and query counts", () => {
  // Free tier: max 5 queries per scan
  const queryExceeded = checkScanExecutionEntitlement("free_tier", {
    monthScans: 0,
    activeScans: 0,
    requestedQueries: 6,
  });
  assert.equal(queryExceeded.allowed, false);
  if (!queryExceeded.allowed) {
    assert.equal(queryExceeded.reason, "query_limit_exceeded");
    assert.equal(queryExceeded.limit, 5);
  }

  // Free tier: max 1 concurrent scan
  const concurrencyExhausted = checkScanExecutionEntitlement("free_tier", {
    monthScans: 0,
    activeScans: 1,
    requestedQueries: 5,
  });
  assert.equal(concurrencyExhausted.allowed, false);
  if (!concurrencyExhausted.allowed) {
    assert.equal(concurrencyExhausted.reason, "concurrency_exhausted");
    assert.equal(concurrencyExhausted.limit, 1);
  }

  // Free tier: max 5 scans per month
  const quotaExhausted = checkScanExecutionEntitlement("free_tier", {
    monthScans: 5,
    activeScans: 0,
    requestedQueries: 5,
  });
  assert.equal(quotaExhausted.allowed, false);
  if (!quotaExhausted.allowed) {
    assert.equal(quotaExhausted.reason, "monthly_scan_quota_exhausted");
    assert.equal(quotaExhausted.limit, 5);
  }

  // Valid execution within limits
  const allowed = checkScanExecutionEntitlement("agency_starter", {
    monthScans: 10,
    activeScans: 1,
    requestedQueries: 8,
  });
  assert.equal(allowed.allowed, true);
  if (allowed.allowed) {
    assert.equal(allowed.remainingScansThisMonth, 39);
  }
});

test("calculateUsageQuota returns frozen summary of all plan quotas", () => {
  const summary = calculateUsageQuota("agency_starter", {
    projectCount: 3,
    monthScans: 12,
    activeScans: 1,
  });

  assert.equal(Object.isFrozen(summary), true);
  assert.equal(summary.tier, "agency_starter");
  assert.equal(summary.planName, "Agency Starter");

  assert.equal(summary.projects.used, 3);
  assert.equal(summary.projects.max, 5);
  assert.equal(summary.projects.remaining, 2);
  assert.equal(summary.projects.exhausted, false);

  assert.equal(summary.scans.usedThisMonth, 12);
  assert.equal(summary.scans.maxPerMonth, 50);
  assert.equal(summary.scans.remainingThisMonth, 38);
  assert.equal(summary.scans.exhausted, false);

  assert.equal(summary.concurrency.active, 1);
  assert.equal(summary.concurrency.max, 2);
  assert.equal(summary.concurrency.available, 1);
});
