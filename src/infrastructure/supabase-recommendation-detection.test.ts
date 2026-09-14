import assert from "node:assert/strict";
import test from "node:test";

import { executeSupabaseRecommendationDetection } from "./supabase-recommendation-detection.ts";

const WORKSPACE_ID = "b1000000-0000-4000-8000-000000000001";
const PROJECT_ID = "b2000000-0000-4000-8000-000000000001";
const OBSERVATION_ID = "b3000000-0000-4000-8000-000000000001";
const CATALOG_ID = "b4000000-0000-4000-8000-000000000001";
const ENTITY_ID = "b5000000-0000-4000-8000-000000000001";
const ALIAS_ID = "b6000000-0000-4000-8000-000000000001";

function request() {
  return {
    workspaceId: WORKSPACE_ID,
    observationId: OBSERVATION_ID,
    catalogId: CATALOG_ID,
  };
}

function readData(answerText = "I recommend Acme.") {
  const startUtf16 = answerText.indexOf("Acme");
  return {
    projectId: PROJECT_ID,
    observationId: OBSERVATION_ID,
    catalogId: CATALOG_ID,
    answerText,
    mentions: [
      {
        occurrenceOrdinal: 0,
        state: "mention",
        entityId: ENTITY_ID,
        entityKind: "company",
        aliasId: ALIAS_ID,
        aliasText: "Acme",
        normalizedAlias: "acme",
        source: {
          startUtf16,
          endUtf16: startUtf16 + 4,
          text: "Acme",
        },
      },
    ],
  };
}

test("reads exact persisted input then persists the derived recommendation set", async () => {
  const calls: { name: string; args: Readonly<Record<string, unknown>> }[] = [];
  const result = await executeSupabaseRecommendationDetection(
    request(),
    async (name, args) => {
      calls.push({ name, args });
      if (name === "read_recommendation_detection_input")
        return { data: readData(), error: null };
      return {
        data: {
          observationId: OBSERVATION_ID,
          catalogId: CATALOG_ID,
          methodVersion: "recommendation-detection-v1",
          resultCount: 1,
          recommendedCount: 1,
          notRecommendedCount: 0,
          unknownCount: 0,
          replayed: false,
        },
        error: null,
      };
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    calls.map((call) => call.name),
    ["read_recommendation_detection_input", "persist_recommendation_detection"],
  );
  const persistPayload = calls[1]?.args.p_detection as {
    methodVersion: string;
    mentionMethodVersion: string;
    results: { state: string; evidence: { text: string } | null }[];
  };
  assert.equal(persistPayload.methodVersion, "recommendation-detection-v1");
  assert.equal(persistPayload.mentionMethodVersion, "mention-detection-v1");
  assert.equal(persistPayload.results[0]?.state, "recommended");
  assert.equal(persistPayload.results[0]?.evidence?.text, "I recommend Acme");
});

test("strictly rejects malformed read envelopes and provenance mismatches", async () => {
  const malformed = await executeSupabaseRecommendationDetection(
    request(),
    async () => ({ data: readData(), nope: null }),
  );
  assert.deepEqual(malformed, {
    ok: false,
    stage: "read",
    code: "invalid_database_response",
  });

  const mismatched = await executeSupabaseRecommendationDetection(
    request(),
    async () => ({
      data: { ...readData(), observationId: "b3000000-0000-4000-8000-000000000099" },
      error: null,
    }),
  );
  assert.deepEqual(mismatched, {
    ok: false,
    stage: "read",
    code: "invalid_database_response",
  });
});

test("maps missing persisted input and persistence replay conflicts", async () => {
  const missing = await executeSupabaseRecommendationDetection(
    request(),
    async () => ({
      data: null,
      error: { code: "P0001", message: "Recommendation detection input not found" },
    }),
  );
  assert.deepEqual(missing, {
    ok: false,
    stage: "read",
    code: "input_not_found",
  });

  const conflict = await executeSupabaseRecommendationDetection(
    request(),
    async (name) => {
      if (name === "read_recommendation_detection_input")
        return { data: readData(), error: null };
      return {
        data: null,
        error: {
          code: "22023",
          message: "Recommendation detection replay conflicts with stored evidence",
        },
      };
    },
  );
  assert.deepEqual(conflict, {
    ok: false,
    stage: "persist",
    code: "idempotency_conflict",
  });
});

test("rejects malformed persistence echoes and thrown transports", async () => {
  const malformed = await executeSupabaseRecommendationDetection(
    request(),
    async (name) => {
      if (name === "read_recommendation_detection_input")
        return { data: readData(), error: null };
      return {
        data: {
          observationId: OBSERVATION_ID,
          catalogId: CATALOG_ID,
          methodVersion: "recommendation-detection-v1",
          resultCount: 1,
          recommendedCount: 1,
          notRecommendedCount: 0,
          unknownCount: 0,
          replayed: false,
          extra: true,
        },
        error: null,
      };
    },
  );
  assert.deepEqual(malformed, {
    ok: false,
    stage: "persist",
    code: "invalid_database_response",
  });

  const thrown = await executeSupabaseRecommendationDetection(request(), async () => {
    throw new Error("offline");
  });
  assert.deepEqual(thrown, {
    ok: false,
    stage: "read",
    code: "database_error",
  });
});
