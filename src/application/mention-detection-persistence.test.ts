import assert from "node:assert/strict";
import test from "node:test";

import {
  detectPersistedMentions,
  type MentionDetectionCatalogProjection,
  type MentionDetectionPersistenceGateway,
  type MentionDetectionReadGateway,
} from "./mention-detection-persistence.ts";

const WORKSPACE_ID = "e1000000-0000-4000-8000-000000000001";
const PROJECT_ID = "e2000000-0000-4000-8000-000000000001";
const OBSERVATION_ID = "e3000000-0000-4000-8000-000000000001";
const CATALOG_ID = "e4000000-0000-4000-8000-000000000001";
const COMPANY_ID = "e5000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "e5000000-0000-4000-8000-000000000002";
const SECOND_PRODUCT_ID = "e5000000-0000-4000-8000-000000000003";
const COMPANY_ALIAS_ID = "e6000000-0000-4000-8000-000000000001";
const PRODUCT_ALIAS_ID = "e6000000-0000-4000-8000-000000000002";
const SECOND_PRODUCT_ALIAS_ID = "e6000000-0000-4000-8000-000000000003";

const CATALOG: MentionDetectionCatalogProjection = Object.freeze({
  catalogId: CATALOG_ID,
  methodVersion: "entity-alias-v1",
  entities: Object.freeze([
    Object.freeze({
      entityId: COMPANY_ID,
      entityOrdinal: 0,
      entityKind: "company" as const,
      canonicalName: "Acme Corporation",
      aliases: Object.freeze([
        Object.freeze({
          aliasId: COMPANY_ALIAS_ID,
          aliasOrdinal: 0,
          aliasText: "Acme",
          normalizedAlias: "acme",
          matchState: "eligible" as const,
        }),
      ]),
    }),
    Object.freeze({
      entityId: PRODUCT_ID,
      entityOrdinal: 1,
      entityKind: "product" as const,
      canonicalName: "Shared One",
      aliases: Object.freeze([
        Object.freeze({
          aliasId: PRODUCT_ALIAS_ID,
          aliasOrdinal: 0,
          aliasText: "Shared",
          normalizedAlias: "shared",
          matchState: "ambiguous" as const,
        }),
      ]),
    }),
    Object.freeze({
      entityId: SECOND_PRODUCT_ID,
      entityOrdinal: 2,
      entityKind: "product" as const,
      canonicalName: "Shared Two",
      aliases: Object.freeze([
        Object.freeze({
          aliasId: SECOND_PRODUCT_ALIAS_ID,
          aliasOrdinal: 0,
          aliasText: "shared",
          normalizedAlias: "shared",
          matchState: "ambiguous" as const,
        }),
      ]),
    }),
  ]),
});

function readGateway(answerText: string | null): MentionDetectionReadGateway {
  return async (workspaceId, observationId, catalogId) => {
    assert.equal(workspaceId, WORKSPACE_ID);
    assert.equal(observationId, OBSERVATION_ID);
    assert.equal(catalogId, CATALOG_ID);
    return {
      ok: true,
      input: {
        projectId: PROJECT_ID,
        observationId: OBSERVATION_ID,
        answerText,
        catalog: CATALOG,
      },
    };
  };
}

const request = {
  workspaceId: WORKSPACE_ID,
  observationId: OBSERVATION_ID,
  catalogId: CATALOG_ID,
};

test("reads exact persisted inputs, preserves mention/ambiguity evidence, and persists once", async () => {
  let persistenceCalls = 0;
  const persistGateway: MentionDetectionPersistenceGateway = async (
    workspaceId,
    observationId,
    catalogId,
    detection,
  ) => {
    persistenceCalls += 1;
    assert.equal(workspaceId, WORKSPACE_ID);
    assert.equal(observationId, OBSERVATION_ID);
    assert.equal(catalogId, CATALOG_ID);
    assert.equal(detection.answerUtf16Length, 16);
    assert.equal(detection.occurrences.length, 2);
    assert.deepEqual(detection.occurrences[0], {
      occurrenceOrdinal: 0,
      state: "mention",
      entityId: COMPANY_ID,
      entityKind: "company",
      aliasId: COMPANY_ALIAS_ID,
      aliasText: "Acme",
      normalizedAlias: "acme",
      source: { startUtf16: 0, endUtf16: 4, text: "Acme" },
    });
    const ambiguous = detection.occurrences[1];
    assert.equal(ambiguous?.state, "ambiguous");
    if (ambiguous?.state === "ambiguous") {
      assert.deepEqual(ambiguous.source, {
        startUtf16: 9,
        endUtf16: 15,
        text: "Shared",
      });
      assert.deepEqual(
        ambiguous.candidates.map((candidate) => candidate.aliasId),
        [PRODUCT_ALIAS_ID, SECOND_PRODUCT_ALIAS_ID],
      );
    }
    return {
      ok: true,
      replayed: false,
      occurrenceCount: 2,
      mentionCount: 1,
      ambiguousCount: 1,
    };
  };

  const result = await detectPersistedMentions(
    request,
    readGateway("Acme and Shared."),
    persistGateway,
  );

  assert.deepEqual(result, {
    ok: true,
    projectId: PROJECT_ID,
    observationId: OBSERVATION_ID,
    catalogId: CATALOG_ID,
    methodVersion: "mention-detection-v1",
    occurrenceCount: 2,
    mentionCount: 1,
    ambiguousCount: 1,
    replayed: false,
  });
  assert.equal(persistenceCalls, 1);
});

test("persists a valid zero-mention result rather than treating it as missing evidence", async () => {
  const persistGateway: MentionDetectionPersistenceGateway = async (
    _workspaceId,
    _observationId,
    _catalogId,
    detection,
  ) => {
    assert.deepEqual(detection.occurrences, []);
    return {
      ok: true,
      replayed: false,
      occurrenceCount: 0,
      mentionCount: 0,
      ambiguousCount: 0,
    };
  };

  const result = await detectPersistedMentions(
    request,
    readGateway("No approved entity appears here."),
    persistGateway,
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.occurrenceCount, 0);
});

test("null persisted answer is explicit and never persisted as zero mentions", async () => {
  let persisted = false;
  const persistGateway: MentionDetectionPersistenceGateway = async () => {
    persisted = true;
    throw new Error("must not persist");
  };

  const result = await detectPersistedMentions(
    request,
    readGateway(null),
    persistGateway,
  );
  assert.deepEqual(result, {
    ok: false,
    stage: "detect",
    code: "answer_not_available",
  });
  assert.equal(persisted, false);
});

test("fails closed when the read provenance does not match the requested observation", async () => {
  const badRead: MentionDetectionReadGateway = async () => ({
    ok: true,
    input: {
      projectId: PROJECT_ID,
      observationId: "e3000000-0000-4000-8000-000000000099",
      answerText: "Acme",
      catalog: CATALOG,
    },
  });

  const result = await detectPersistedMentions(
    request,
    badRead,
    async () => {
      throw new Error("must not persist");
    },
  );
  assert.deepEqual(result, {
    ok: false,
    stage: "read",
    code: "invalid_database_response",
  });
});

test("propagates safe replay state and rejects forged persistence counts", async () => {
  const replayed = await detectPersistedMentions(
    request,
    readGateway("Acme"),
    async () => ({
      ok: true,
      replayed: true,
      occurrenceCount: 1,
      mentionCount: 1,
      ambiguousCount: 0,
    }),
  );
  assert.equal(replayed.ok, true);
  if (replayed.ok) assert.equal(replayed.replayed, true);

  const forged = await detectPersistedMentions(
    request,
    readGateway("Acme"),
    async () => ({
      ok: true,
      replayed: false,
      occurrenceCount: 0,
      mentionCount: 0,
      ambiguousCount: 0,
    }),
  );
  assert.deepEqual(forged, {
    ok: false,
    stage: "persist",
    code: "invalid_database_response",
  });
});

test("validates request IDs before any database gateway", async () => {
  let read = false;
  const result = await detectPersistedMentions(
    { ...request, workspaceId: ` ${WORKSPACE_ID}` },
    async () => {
      read = true;
      throw new Error("must not read");
    },
    async () => {
      throw new Error("must not persist");
    },
  );
  assert.deepEqual(result, {
    ok: false,
    stage: "request",
    code: "invalid_workspace_id",
  });
  assert.equal(read, false);
});
