import assert from "node:assert/strict";
import test from "node:test";

import { executeSupabaseMentionDetection } from "./supabase-mention-detection.ts";

const WORKSPACE_ID = "f1000000-0000-4000-8000-000000000001";
const PROJECT_ID = "f2000000-0000-4000-8000-000000000001";
const OBSERVATION_ID = "f3000000-0000-4000-8000-000000000001";
const CATALOG_ID = "f4000000-0000-4000-8000-000000000001";
const COMPANY_ID = "f5000000-0000-4000-8000-000000000001";
const ALIAS_ID = "f6000000-0000-4000-8000-000000000001";

const request = {
  workspaceId: WORKSPACE_ID,
  observationId: OBSERVATION_ID,
  catalogId: CATALOG_ID,
};

function readData(answerText: string | null = "ACME") {
  return {
    projectId: PROJECT_ID,
    observationId: OBSERVATION_ID,
    answerText,
    catalog: {
      catalogId: CATALOG_ID,
      methodVersion: "entity-alias-v1",
      entities: [
        {
          entityId: COMPANY_ID,
          entityOrdinal: 0,
          entityKind: "company",
          canonicalName: "Acme Corporation",
          aliases: [
            {
              aliasId: ALIAS_ID,
              aliasOrdinal: 0,
              aliasText: "Acme",
              normalizedAlias: "acme",
              matchState: "eligible",
            },
          ],
        },
      ],
    },
  };
}

test("executes the exact service read then persists the exact D3a result", async () => {
  const calls: string[] = [];
  const result = await executeSupabaseMentionDetection(request, async (name, args) => {
    calls.push(name);
    if (name === "read_mention_detection_input") {
      assert.deepEqual(args, {
        p_workspace_id: WORKSPACE_ID,
        p_observation_id: OBSERVATION_ID,
        p_catalog_id: CATALOG_ID,
      });
      return { data: readData(), error: null };
    }

    assert.equal(args.p_workspace_id, WORKSPACE_ID);
    assert.equal(args.p_observation_id, OBSERVATION_ID);
    assert.equal(args.p_catalog_id, CATALOG_ID);
    const detection = args.p_detection as {
      methodVersion: string;
      catalogId: string;
      occurrences: Array<{
        state: string;
        source: { startUtf16: number; endUtf16: number; text: string };
      }>;
    };
    assert.equal(detection.methodVersion, "mention-detection-v1");
    assert.equal(detection.catalogId, CATALOG_ID);
    assert.deepEqual(detection.occurrences, [
      {
        occurrenceOrdinal: 0,
        state: "mention",
        entityId: COMPANY_ID,
        entityKind: "company",
        aliasId: ALIAS_ID,
        aliasText: "Acme",
        normalizedAlias: "acme",
        source: { startUtf16: 0, endUtf16: 4, text: "ACME" },
      },
    ]);
    return {
      data: {
        observationId: OBSERVATION_ID,
        catalogId: CATALOG_ID,
        methodVersion: "mention-detection-v1",
        occurrenceCount: 1,
        mentionCount: 1,
        ambiguousCount: 0,
        replayed: false,
      },
      error: null,
    };
  });

  assert.deepEqual(calls, [
    "read_mention_detection_input",
    "persist_mention_detection",
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.mentionCount, 1);
});

test("fails closed on malformed nested read data before persistence", async () => {
  let persistCalled = false;
  const result = await executeSupabaseMentionDetection(request, async (name) => {
    if (name === "read_mention_detection_input") {
      return {
        data: {
          ...readData(),
          catalog: { ...readData().catalog, extra: true },
        },
        error: null,
      };
    }
    persistCalled = true;
    throw new Error("must not persist");
  });

  assert.deepEqual(result, {
    ok: false,
    stage: "read",
    code: "invalid_database_response",
  });
  assert.equal(persistCalled, false);
});

test("maps exact read not-found error without calling persistence", async () => {
  const result = await executeSupabaseMentionDetection(request, async (name) => {
    assert.equal(name, "read_mention_detection_input");
    return {
      data: null,
      error: { code: "P0001", message: "Mention detection input not found" },
    };
  });
  assert.deepEqual(result, {
    ok: false,
    stage: "read",
    code: "input_not_found",
  });
});

test("keeps null answer explicit and never calls the persistence RPC", async () => {
  const calls: string[] = [];
  const result = await executeSupabaseMentionDetection(request, async (name) => {
    calls.push(name);
    if (name === "read_mention_detection_input")
      return { data: readData(null), error: null };
    throw new Error("must not persist");
  });
  assert.deepEqual(calls, ["read_mention_detection_input"]);
  assert.deepEqual(result, {
    ok: false,
    stage: "detect",
    code: "answer_not_available",
  });
});

test("maps conflicting persistence replay and rejects malformed success envelopes", async () => {
  const conflict = await executeSupabaseMentionDetection(request, async (name) => {
    if (name === "read_mention_detection_input")
      return { data: readData(), error: null };
    return {
      data: null,
      error: {
        code: "22023",
        message: "Mention detection replay conflicts with stored evidence",
      },
    };
  });
  assert.deepEqual(conflict, {
    ok: false,
    stage: "persist",
    code: "idempotency_conflict",
  });

  const malformed = await executeSupabaseMentionDetection(request, async (name) => {
    if (name === "read_mention_detection_input")
      return { data: readData(), error: null };
    return {
      data: {
        observationId: OBSERVATION_ID,
        catalogId: CATALOG_ID,
        methodVersion: "mention-detection-v1",
        occurrenceCount: 1,
        mentionCount: 1,
        ambiguousCount: 0,
        replayed: false,
        extra: true,
      },
      error: null,
    };
  });
  assert.deepEqual(malformed, {
    ok: false,
    stage: "persist",
    code: "invalid_database_response",
  });
});
