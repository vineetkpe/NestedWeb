import assert from "node:assert/strict";
import test from "node:test";

import {
  generateCustomerActions,
  type CustomerActionInputObservation,
} from "./customer-actions.ts";

test("returns empty array when no observations are provided or brand name is empty", () => {
  const emptyObs = generateCustomerActions({
    targetBrandName: "Acme Analytics",
    trackedDomain: "acme.com",
    observations: [],
  });
  assert.deepEqual(emptyObs, []);

  const emptyBrand = generateCustomerActions({
    targetBrandName: "",
    trackedDomain: "acme.com",
    observations: [
      {
        queryId: "q1",
        queryText: "Best tools for enterprise analytics",
        targetBrandMentioned: false,
        targetBrandRecommended: false,
        competitorMentions: [],
        citedDomains: ["techradar.com"],
      },
    ],
  });
  assert.deepEqual(emptyBrand, []);
});

test("generates comparison defense action when competitor is recommended over target", () => {
  const observations: CustomerActionInputObservation[] = [
    {
      queryId: "q1",
      queryText: "Top product analytics platforms in 2026",
      targetBrandMentioned: true,
      targetBrandRecommended: false,
      competitorMentions: [
        { name: "Mixpanel", recommended: true },
        { name: "Amplitude", recommended: false },
      ],
      citedDomains: ["acme.com", "mixpanel.com"],
    },
    {
      queryId: "q2",
      queryText: "Alternatives to Google Analytics for SaaS",
      targetBrandMentioned: false,
      targetBrandRecommended: false,
      competitorMentions: [{ name: "Mixpanel", recommended: true }],
      citedDomains: ["mixpanel.com"],
    },
  ];

  const actions = generateCustomerActions({
    targetBrandName: "Acme Analytics",
    trackedDomain: "acme.com",
    observations,
  });

  const defenseAction = actions.find(
    (a) => a.category === "comparison_defense",
  );
  assert.ok(defenseAction);
  assert.equal(defenseAction.impact, "high"); // 2 queries -> high impact
  assert.equal(defenseAction.targetEntity, "Mixpanel");
  assert.match(
    defenseAction.title,
    /Defend comparison queries against Mixpanel/,
  );
  assert.deepEqual(defenseAction.supportingQueryIds, ["q1", "q2"]);
});

test("does not generate comparison defense if target brand was also recommended", () => {
  const observations: CustomerActionInputObservation[] = [
    {
      queryId: "q1",
      queryText: "Top analytics tools",
      targetBrandMentioned: true,
      targetBrandRecommended: true, // target was recommended!
      competitorMentions: [{ name: "Mixpanel", recommended: true }],
      citedDomains: ["acme.com"],
    },
  ];

  const actions = generateCustomerActions({
    targetBrandName: "Acme",
    trackedDomain: "acme.com",
    observations,
  });

  const defenseAction = actions.find(
    (a) => a.category === "comparison_defense",
  );
  assert.equal(defenseAction, undefined);
});

test("generates citation building action for prominent external domains", () => {
  const observations: CustomerActionInputObservation[] = [
    {
      queryId: "q1",
      queryText: "Best SaaS analytics",
      targetBrandMentioned: true,
      targetBrandRecommended: false,
      competitorMentions: [],
      citedDomains: ["g2.com", "capterra.com"],
    },
    {
      queryId: "q2",
      queryText: "Customer data platform tools",
      targetBrandMentioned: true,
      targetBrandRecommended: false,
      competitorMentions: [],
      citedDomains: ["g2.com", "segment.com"],
    },
  ];

  const actions = generateCustomerActions({
    targetBrandName: "Acme",
    trackedDomain: "acme.com",
    observations,
  });

  const g2Citation = actions.find(
    (a) => a.category === "citation_building" && a.targetEntity === "g2.com",
  );
  assert.ok(g2Citation);
  assert.equal(g2Citation.targetEntity, "g2.com");
  assert.deepEqual(g2Citation.supportingQueryIds, ["q1", "q2"]);
});

test("does not recommend client's own domain or subdomains for citation building", () => {
  const observations: CustomerActionInputObservation[] = [
    {
      queryId: "q1",
      queryText: "Analytics comparison",
      targetBrandMentioned: true,
      targetBrandRecommended: false,
      competitorMentions: [],
      citedDomains: ["acme.com", "blog.acme.com"],
    },
  ];

  const actions = generateCustomerActions({
    targetBrandName: "Acme",
    trackedDomain: "acme.com",
    observations,
  });

  const selfCitation = actions.find(
    (a) =>
      a.category === "citation_building" &&
      (a.targetEntity === "acme.com" || a.targetEntity === "blog.acme.com"),
  );
  assert.equal(selfCitation, undefined);
});

test("generates content expansion action when target brand was unmentioned", () => {
  const observations: CustomerActionInputObservation[] = [
    {
      queryId: "q1",
      queryText: "How to measure product analytics retention",
      targetBrandMentioned: false, // unmentioned
      targetBrandRecommended: false,
      competitorMentions: [],
      citedDomains: ["mixpanel.com"],
    },
  ];

  const actions = generateCustomerActions({
    targetBrandName: "Acme",
    trackedDomain: "acme.com",
    observations,
  });

  const contentAction = actions.find((a) => a.category === "content_expansion");
  assert.ok(contentAction);
  assert.match(contentAction.title, /Publish targeted content/);
  assert.deepEqual(contentAction.supportingQueryIds, ["q1"]);
});

test("returns frozen array with high-impact items prioritized", () => {
  const observations: CustomerActionInputObservation[] = [
    {
      queryId: "q1",
      queryText: "Category tool 1",
      targetBrandMentioned: false,
      targetBrandRecommended: false,
      competitorMentions: [{ name: "CompetitorA", recommended: true }],
      citedDomains: ["authority.org"],
    },
    {
      queryId: "q2",
      queryText: "Category tool 2",
      targetBrandMentioned: false,
      targetBrandRecommended: false,
      competitorMentions: [{ name: "CompetitorA", recommended: true }],
      citedDomains: ["authority.org"],
    },
  ];

  const actions = generateCustomerActions({
    targetBrandName: "Acme",
    trackedDomain: "acme.com",
    observations,
  });

  assert.equal(Object.isFrozen(actions), true);
  assert.ok(actions.length > 0);
  assert.equal(Object.isFrozen(actions[0]), true);

  // Highest impact should be first
  assert.equal(actions[0]?.impact, "high");
});
