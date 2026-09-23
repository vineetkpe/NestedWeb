import assert from "node:assert/strict";
import test from "node:test";

import {
  detectPersistedRecommendations,
  type PersistedRecommendationDetectionInput,
  type RecommendationDetectionPersistenceGateway,
  type RecommendationDetectionReadGateway,
} from "./recommendation-detection-persistence.ts";

const WORKSPACE_ID = "a1000000-0000-4000-8000-000000000001";
const PROJECT_ID = "a2000000-0000-4000-8000-000000000001";
const OBSERVATION_ID = "a3000000-0000-4000-8000-000000000001";
const CATALOG_ID = "a4000000-0000-4000-8000-000000000001";
const ENTITY_ID = "a5000000-0000-4000-8000-000000000001";
const ALIAS_ID = "a6000000-0000-4000-8000-000000000001";

function persistedInput(answerText: string): PersistedRecommendationDetectionInput {
  const firstStart = answerText.indexOf("Acme");
  const secondStart = answerText.lastIndexOf("Acme");
  return {
    projectId: PROJECT_ID,
    observationId: OBSERVATION_ID,
    catalogId: CATALOG_ID,
    answerText,
    mentions:
      firstStart < 0
        ? []
        : [
            {
              occurrenceOrdinal: 0,
              state: "mention",
              entityId: ENTITY_ID,
              entityKind: "company",
              aliasId: ALIAS_ID,
              aliasText: "Acme",
              normalizedAlias: "acme",
              source: {
                startUtf16: firstStart,
                endUtf16: firstStart + 4,
                text: "Acme",
              },
            },
            ...(secondStart > firstStart
              ? [
                  {
                    occurrenceOrdinal: 2,
                    state: "mention" as const,
                    entityId: ENTITY_ID,
                    entityKind: "company" as const,
                    aliasId: ALIAS_ID,
                    aliasText: "Acme",
                    normalizedAlias: "acme",
                    source: {
                      startUtf16: secondStart,
                      endUtf16: secondStart + 4,
                      text: "Acme",
                    },
                  },
                ]
              : []),
          ],
  };
}

function request() {
  return {
    workspaceId: WORKSPACE_ID,
    observationId: OBSERVATION_ID,
    catalogId: CATALOG_ID,
  };
}

test("classifies exact persisted positive mentions and persists one atomic set", async () => {
  const input = persistedInput("I recommend Acme. Acme supports SSO.");
  const seen: unknown[] = [];
  const read: RecommendationDetectionReadGateway = async () => ({ ok: true, input });
  const persist: RecommendationDetectionPersistenceGateway = async (
    workspaceId,
    observationId,
    catalogId,
    classifications,
  ) => {
    seen.push({ workspaceId, observationId, catalogId, classifications });
    return {
      ok: true,
      replayed: false,
      resultCount: 2,
      recommendedCount: 1,
      notRecommendedCount: 0,
      unknownCount: 1,
    };
  };

  const result = await detectPersistedRecommendations(request(), read, persist);
  assert.deepEqual(result, {
    ok: true,
    projectId: PROJECT_ID,
    observationId: OBSERVATION_ID,
    catalogId: CATALOG_ID,
    methodVersion: "recommendation-detection-v1",
    resultCount: 2,
    recommendedCount: 1,
    notRecommendedCount: 0,
    unknownCount: 1,
    replayed: false,
  });
  assert.equal(seen.length, 1);
  const payload = seen[0] as {
    classifications: readonly { occurrenceOrdinal: number; classification: { state: string } }[];
  };
  assert.deepEqual(
    payload.classifications.map((entry) => [
      entry.occurrenceOrdinal,
      entry.classification.state,
    ]),
    [
      [0, "recommended"],
      [2, "unknown"],
    ],
  );
});

test("persists a zero-result run when D3 has no positive mentions", async () => {
  const input = persistedInput("No approved alias occurs here.");
  let persisted = false;
  const read: RecommendationDetectionReadGateway = async () => ({ ok: true, input });
  const persist: RecommendationDetectionPersistenceGateway = async (
    _workspaceId,
    _observationId,
    _catalogId,
    classifications,
  ) => {
    persisted = true;
    assert.deepEqual(classifications, []);
    return {
      ok: true,
      replayed: false,
      resultCount: 0,
      recommendedCount: 0,
      notRecommendedCount: 0,
      unknownCount: 0,
    };
  };

  const result = await detectPersistedRecommendations(request(), read, persist);
  assert.equal(result.ok, true);
  assert.equal(persisted, true);
  if (result.ok) assert.equal(result.resultCount, 0);
});

test("keeps explicit negative recommendation distinct from unknown", async () => {
  const input = persistedInput("Avoid Acme for this workload.");
  const read: RecommendationDetectionReadGateway = async () => ({ ok: true, input });
  const persist: RecommendationDetectionPersistenceGateway = async (
    _workspaceId,
    _observationId,
    _catalogId,
    classifications,
  ) => {
    assert.equal(classifications[0]?.classification.state, "not_recommended");
    return {
      ok: true,
      replayed: true,
      resultCount: 1,
      recommendedCount: 0,
      notRecommendedCount: 1,
      unknownCount: 0,
    };
  };

  const result = await detectPersistedRecommendations(request(), read, persist);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.notRecommendedCount, 1);
    assert.equal(result.replayed, true);
  }
});

test("fails closed for null answer and malformed persisted mention evidence", async () => {
  const nullInput = { ...persistedInput("Acme"), answerText: null };
  const nullRead: RecommendationDetectionReadGateway = async () => ({
    ok: true,
    input: nullInput,
  });
  const neverPersist: RecommendationDetectionPersistenceGateway = async () => {
    assert.fail("persistence must not run");
  };
  assert.deepEqual(
    await detectPersistedRecommendations(request(), nullRead, neverPersist),
    { ok: false, stage: "detect", code: "answer_not_available" },
  );

  const malformedInput = persistedInput("Acme");
  const malformedRead: RecommendationDetectionReadGateway = async () => ({
    ok: true,
    input: {
      ...malformedInput,
      mentions: [
        {
          ...malformedInput.mentions[0]!,
          source: { startUtf16: 0, endUtf16: 4, text: "Fake" },
        },
      ],
    },
  });
  assert.deepEqual(
    await detectPersistedRecommendations(request(), malformedRead, neverPersist),
    { ok: false, stage: "read", code: "invalid_database_response" },
  );
});

test("fails closed when persistence counts do not echo the derived set", async () => {
  const input = persistedInput("I recommend Acme.");
  const read: RecommendationDetectionReadGateway = async () => ({ ok: true, input });
  const persist: RecommendationDetectionPersistenceGateway = async () => ({
    ok: true,
    replayed: false,
    resultCount: 1,
    recommendedCount: 0,
    notRecommendedCount: 0,
    unknownCount: 1,
  });

  assert.deepEqual(
    await detectPersistedRecommendations(request(), read, persist),
    { ok: false, stage: "persist", code: "invalid_database_response" },
  );
});
