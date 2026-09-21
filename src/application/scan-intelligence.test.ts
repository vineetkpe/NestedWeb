import assert from "node:assert/strict";
import test from "node:test";

import type { MentionOccurrence } from "../domain/mention-detection.ts";
import {
  createScanIntelligenceRunners,
  evaluateMentionRecommendations,
  processScanIntelligence,
  type ScanIntelligenceDependencies,
} from "./scan-intelligence.ts";
import type {
  CitationNormalizationPersistenceGateway,
  CitationNormalizationReadGateway,
  NormalizePersistedCitationsResult,
} from "./citation-normalization-persistence.ts";
import type {
  DetectPersistedMentionsResult,
  MentionDetectionPersistenceGateway,
  MentionDetectionReadGateway,
} from "./mention-detection-persistence.ts";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const CATALOG_ID = "22222222-2222-4222-8222-222222222222";
const OBS_1 = "33333333-3333-4333-8333-333333333331";
const OBS_2 = "33333333-3333-4333-8333-333333333332";
const OBS_3 = "33333333-3333-4333-8333-333333333333";

function mockCitationSuccess(
  observationId: string,
  counts: {
    citations: number;
    normalized: number;
    excluded: number;
    replayed: number;
  },
): NormalizePersistedCitationsResult {
  return Object.freeze({
    ok: true as const,
    observationId,
    citationCount: counts.citations,
    normalizedCount: counts.normalized,
    excludedCount: counts.excluded,
    replayedCount: counts.replayed,
    methodVersion: "citation-url-v1" as const,
  });
}

function mockMentionSuccess(
  observationId: string,
  counts: { occurrences: number; mentions: number; ambiguous: number },
): DetectPersistedMentionsResult {
  return Object.freeze({
    ok: true as const,
    projectId: "44444444-4444-4444-8444-444444444444",
    observationId,
    catalogId: CATALOG_ID,
    methodVersion: "mention-detection-v1" as const,
    occurrenceCount: counts.occurrences,
    mentionCount: counts.mentions,
    ambiguousCount: counts.ambiguous,
    replayed: false,
  });
}

test("rejects invalid request parameters fail-closed", async () => {
  const dummyDeps: ScanIntelligenceDependencies = {
    normalizeCitations: async () => {
      throw new Error("should not be called");
    },
    detectMentions: async () => {
      throw new Error("should not be called");
    },
  };

  const badWorkspace = await processScanIntelligence(
    {
      workspaceId: "not-a-uuid",
      catalogId: CATALOG_ID,
      observationIds: [OBS_1],
    },
    dummyDeps,
  );
  assert.deepEqual(badWorkspace, {
    ok: false,
    stage: "request",
    code: "invalid_workspace_id",
  });

  const badCatalog = await processScanIntelligence(
    { workspaceId: WORKSPACE_ID, catalogId: "", observationIds: [OBS_1] },
    dummyDeps,
  );
  assert.deepEqual(badCatalog, {
    ok: false,
    stage: "request",
    code: "invalid_catalog_id",
  });

  const emptyObs = await processScanIntelligence(
    { workspaceId: WORKSPACE_ID, catalogId: CATALOG_ID, observationIds: [] },
    dummyDeps,
  );
  assert.deepEqual(emptyObs, {
    ok: false,
    stage: "request",
    code: "invalid_observation_ids",
  });

  const nonArrayObs = await processScanIntelligence(
    {
      workspaceId: WORKSPACE_ID,
      catalogId: CATALOG_ID,
      observationIds: "not-an-array",
    },
    dummyDeps,
  );
  assert.deepEqual(nonArrayObs, {
    ok: false,
    stage: "request",
    code: "invalid_observation_ids",
  });

  const badItemObs = await processScanIntelligence(
    {
      workspaceId: WORKSPACE_ID,
      catalogId: CATALOG_ID,
      observationIds: [OBS_1, "bad-id"],
    },
    dummyDeps,
  );
  assert.deepEqual(badItemObs, {
    ok: false,
    stage: "request",
    code: "invalid_observation_ids",
  });

  const tooManyObs = await processScanIntelligence(
    {
      workspaceId: WORKSPACE_ID,
      catalogId: CATALOG_ID,
      observationIds: Array.from(
        { length: 101 },
        (_, i) => `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`,
      ),
    },
    dummyDeps,
  );
  assert.deepEqual(tooManyObs, {
    ok: false,
    stage: "request",
    code: "invalid_observation_ids",
  });
});

test("deduplicates observation IDs while maintaining encounter order", async () => {
  const calledObservations: string[] = [];
  const deps: ScanIntelligenceDependencies = {
    normalizeCitations: async (req) => {
      calledObservations.push(`citations:${req.observationId}`);
      return mockCitationSuccess(req.observationId as string, {
        citations: 1,
        normalized: 1,
        excluded: 0,
        replayed: 0,
      });
    },
    detectMentions: async (req) => {
      calledObservations.push(`mentions:${req.observationId}`);
      return mockMentionSuccess(req.observationId as string, {
        occurrences: 1,
        mentions: 1,
        ambiguous: 0,
      });
    },
  };

  const result = await processScanIntelligence(
    {
      workspaceId: WORKSPACE_ID,
      catalogId: CATALOG_ID,
      observationIds: [OBS_1, OBS_2, OBS_1, OBS_2],
    },
    deps,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.observationCount, 2);
  assert.equal(result.successfulObservations, 2);
  assert.equal(result.failedObservations, 0);
  assert.deepEqual(calledObservations, [
    `citations:${OBS_1}`,
    `mentions:${OBS_1}`,
    `citations:${OBS_2}`,
    `mentions:${OBS_2}`,
  ]);
});

test("successfully orchestrates and aggregates metrics across observations", async () => {
  const deps: ScanIntelligenceDependencies = {
    normalizeCitations: async (req) => {
      if (req.observationId === OBS_1) {
        return mockCitationSuccess(OBS_1, {
          citations: 3,
          normalized: 2,
          excluded: 1,
          replayed: 1,
        });
      }
      return mockCitationSuccess(OBS_2, {
        citations: 2,
        normalized: 2,
        excluded: 0,
        replayed: 0,
      });
    },
    detectMentions: async (req) => {
      if (req.observationId === OBS_1) {
        return mockMentionSuccess(OBS_1, {
          occurrences: 4,
          mentions: 3,
          ambiguous: 1,
        });
      }
      return mockMentionSuccess(OBS_2, {
        occurrences: 2,
        mentions: 2,
        ambiguous: 0,
      });
    },
  };

  const result = await processScanIntelligence(
    {
      workspaceId: WORKSPACE_ID,
      catalogId: CATALOG_ID,
      observationIds: [OBS_1, OBS_2],
    },
    deps,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.equal(result.catalogId, CATALOG_ID);
  assert.equal(result.observationCount, 2);
  assert.equal(result.successfulObservations, 2);
  assert.equal(result.failedObservations, 0);

  assert.deepEqual(result.totals, {
    citationCount: 5,
    normalizedCitationCount: 4,
    excludedCitationCount: 1,
    replayedCitationCount: 1,
    occurrenceCount: 6,
    mentionCount: 5,
    ambiguousCount: 1,
  });

  assert.equal(result.observations.length, 2);
  assert.equal(result.observations[0]?.observationId, OBS_1);
  assert.equal(result.observations[1]?.observationId, OBS_2);
});

test("isolates observation failures without aborting the batch", async () => {
  const deps: ScanIntelligenceDependencies = {
    normalizeCitations: async (req) => {
      if (req.observationId === OBS_1) {
        return mockCitationSuccess(OBS_1, {
          citations: 2,
          normalized: 2,
          excluded: 0,
          replayed: 0,
        });
      }
      if (req.observationId === OBS_2) {
        return {
          ok: false,
          stage: "read",
          code: "observation_not_found",
        };
      }
      return mockCitationSuccess(OBS_3, {
        citations: 1,
        normalized: 1,
        excluded: 0,
        replayed: 0,
      });
    },
    detectMentions: async (req) => {
      if (req.observationId === OBS_1) {
        return mockMentionSuccess(OBS_1, {
          occurrences: 1,
          mentions: 1,
          ambiguous: 0,
        });
      }
      if (req.observationId === OBS_2) {
        return mockMentionSuccess(OBS_2, {
          occurrences: 0,
          mentions: 0,
          ambiguous: 0,
        });
      }
      return {
        ok: false,
        stage: "read",
        code: "database_error",
      };
    },
  };

  const result = await processScanIntelligence(
    {
      workspaceId: WORKSPACE_ID,
      catalogId: CATALOG_ID,
      observationIds: [OBS_1, OBS_2, OBS_3],
    },
    deps,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.observationCount, 3);
  assert.equal(result.successfulObservations, 1);
  assert.equal(result.failedObservations, 2);

  // Totals only include successful steps
  assert.equal(result.totals.citationCount, 3); // OBS_1 (2) + OBS_3 (1)
  assert.equal(result.totals.normalizedCitationCount, 3);
  assert.equal(result.totals.occurrenceCount, 1); // OBS_1 (1) + OBS_2 (0)
  assert.equal(result.totals.mentionCount, 1);
});

test("createScanIntelligenceRunners wires gateways correctly", async () => {
  const citationReadGateway: CitationNormalizationReadGateway = async () => ({
    ok: true,
    citations: [
      {
        citationOrdinal: 0,
        citationId: `${OBS_1}:grounding:0`,
        citedUrl: "https://example.com/blog/article?utm_medium=cpc#hash",
      },
    ],
  });

  const citationPersistGateway: CitationNormalizationPersistenceGateway =
    async (_w, _o, citationId) => ({
      ok: true,
      citationId,
      replayed: false,
    });

  const mentionReadGateway: MentionDetectionReadGateway = async () => ({
    ok: true,
    input: {
      projectId: "44444444-4444-4444-8444-444444444444",
      observationId: OBS_1,
      answerText: "We recommend Acme for all enterprise needs.",
      catalog: {
        catalogId: CATALOG_ID,
        methodVersion: "entity-alias-v1",
        entities: [
          {
            entityId: "55555555-5555-4555-8555-555555555555",
            entityOrdinal: 0,
            entityKind: "company",
            canonicalName: "Acme Corp",
            aliases: [
              {
                aliasId: "66666666-6666-4666-8666-666666666666",
                aliasOrdinal: 0,
                aliasText: "Acme",
                normalizedAlias: "acme",
                matchState: "eligible",
              },
            ],
          },
        ],
      },
    },
  });

  const mentionPersistGateway: MentionDetectionPersistenceGateway =
    async () => ({
      ok: true,
      replayed: false,
      occurrenceCount: 1,
      mentionCount: 1,
      ambiguousCount: 0,
    });

  const runners = createScanIntelligenceRunners(
    citationReadGateway,
    citationPersistGateway,
    mentionReadGateway,
    mentionPersistGateway,
  );

  const result = await processScanIntelligence(
    {
      workspaceId: WORKSPACE_ID,
      catalogId: CATALOG_ID,
      observationIds: [OBS_1],
    },
    runners,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.successfulObservations, 1);
  assert.equal(result.totals.normalizedCitationCount, 1);
  assert.equal(result.totals.mentionCount, 1);
});

test("evaluateMentionRecommendations classifies recommendations with evidence spans", () => {
  const answerText =
    "For customer billing, I recommend Acme as the primary platform. However, avoid Beta due to high costs.";

  const acmeMention: MentionOccurrence = {
    occurrenceOrdinal: 0,
    state: "mention",
    entityId: "55555555-5555-4555-8555-555555555555",
    entityKind: "company",
    aliasId: "66666666-6666-4666-8666-666666666666",
    aliasText: "Acme",
    normalizedAlias: "acme",
    source: {
      startUtf16: 34,
      endUtf16: 38,
      text: "Acme",
    },
  };

  const betaMention: MentionOccurrence = {
    occurrenceOrdinal: 1,
    state: "mention",
    entityId: "77777777-7777-4777-8777-777777777777",
    entityKind: "company",
    aliasId: "88888888-8888-4888-8888-888888888888",
    aliasText: "Beta",
    normalizedAlias: "beta",
    source: {
      startUtf16: 79,
      endUtf16: 83,
      text: "Beta",
    },
  };

  const evaluations = evaluateMentionRecommendations(answerText, [
    acmeMention,
    betaMention,
  ]);

  assert.equal(evaluations.length, 2);

  const [acmeEval, betaEval] = evaluations;
  assert.ok(acmeEval);
  assert.ok(betaEval);

  assert.equal(acmeEval.entityId, acmeMention.entityId);
  assert.equal(acmeEval.recommendation.ok, true);
  if (acmeEval.recommendation.ok) {
    assert.equal(acmeEval.recommendation.state, "recommended");
    assert.ok(acmeEval.recommendation.evidence);
    assert.equal(acmeEval.recommendation.evidence?.text, "I recommend Acme");
  }

  assert.equal(betaEval.entityId, betaMention.entityId);
  assert.equal(betaEval.recommendation.ok, true);
  if (betaEval.recommendation.ok) {
    assert.equal(betaEval.recommendation.state, "not_recommended");
    assert.ok(betaEval.recommendation.evidence);
    assert.equal(betaEval.recommendation.evidence?.text, "avoid Beta");
  }
});
