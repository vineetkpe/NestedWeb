import assert from "node:assert/strict";
import test from "node:test";

import { generateScanCustomerActions } from "./customer-actions.ts";

const VALID_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const VALID_PROJECT_ID = "22222222-2222-4222-8222-222222222222";

test("generateScanCustomerActions rejects invalid boundary parameters fail-closed", () => {
  // Invalid workspace ID
  const invalidWorkspace = generateScanCustomerActions({
    workspaceId: "not-a-uuid",
    projectId: VALID_PROJECT_ID,
    targetBrandName: "Acme",
    trackedDomain: "acme.com",
    observations: [],
  });
  assert.equal(invalidWorkspace.ok, false);
  if (!invalidWorkspace.ok) {
    assert.equal(invalidWorkspace.code, "invalid_workspace_id");
  }

  // Invalid project ID
  const invalidProject = generateScanCustomerActions({
    workspaceId: VALID_WORKSPACE_ID,
    projectId: "not-a-uuid",
    targetBrandName: "Acme",
    trackedDomain: "acme.com",
    observations: [],
  });
  assert.equal(invalidProject.ok, false);
  if (!invalidProject.ok) {
    assert.equal(invalidProject.code, "invalid_project_id");
  }

  // Empty brand name
  const emptyBrand = generateScanCustomerActions({
    workspaceId: VALID_WORKSPACE_ID,
    projectId: VALID_PROJECT_ID,
    targetBrandName: "   ",
    trackedDomain: "acme.com",
    observations: [],
  });
  assert.equal(emptyBrand.ok, false);
  if (!emptyBrand.ok) {
    assert.equal(emptyBrand.code, "invalid_brand_name");
  }

  // Empty tracked domain
  const emptyDomain = generateScanCustomerActions({
    workspaceId: VALID_WORKSPACE_ID,
    projectId: VALID_PROJECT_ID,
    targetBrandName: "Acme",
    trackedDomain: "",
    observations: [],
  });
  assert.equal(emptyDomain.ok, false);
  if (!emptyDomain.ok) {
    assert.equal(emptyDomain.code, "invalid_tracked_domain");
  }

  // Malformed observations
  const malformedObs = generateScanCustomerActions({
    workspaceId: VALID_WORKSPACE_ID,
    projectId: VALID_PROJECT_ID,
    targetBrandName: "Acme",
    trackedDomain: "acme.com",
    observations: "not-an-array",
  });
  assert.equal(malformedObs.ok, false);
  if (!malformedObs.ok) {
    assert.equal(malformedObs.code, "invalid_observations");
  }

  const malformedItem = generateScanCustomerActions({
    workspaceId: VALID_WORKSPACE_ID,
    projectId: VALID_PROJECT_ID,
    targetBrandName: "Acme",
    trackedDomain: "acme.com",
    observations: [{ queryId: "q1" }], // missing required fields
  });
  assert.equal(malformedItem.ok, false);
  if (!malformedItem.ok) {
    assert.equal(malformedItem.code, "invalid_observations");
  }
});

test("generateScanCustomerActions validates and returns structured actions for valid input", () => {
  const result = generateScanCustomerActions({
    workspaceId: VALID_WORKSPACE_ID,
    projectId: VALID_PROJECT_ID,
    targetBrandName: "Acme Analytics",
    trackedDomain: "acme.com",
    observations: [
      {
        queryId: "q1",
        queryText: "Top analytics software",
        targetBrandMentioned: false,
        targetBrandRecommended: false,
        competitorMentions: [{ name: "CompetitorX", recommended: true }],
        citedDomains: ["techcrunch.com", "g2.com"],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.actions.length > 0);
    const defense = result.actions.find(
      (a) => a.category === "comparison_defense",
    );
    assert.ok(defense);
    assert.equal(defense?.targetEntity, "CompetitorX");
  }
});
