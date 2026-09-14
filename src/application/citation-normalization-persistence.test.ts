import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePersistedCitations,
  type CitationNormalizationPersistenceGateway,
  type CitationNormalizationReadGateway,
  type PersistedCitationOccurrence,
} from "./citation-normalization-persistence.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const observationId = "22222222-2222-4222-8222-222222222222";

function reader(
  citations: ReadonlyArray<PersistedCitationOccurrence>,
): CitationNormalizationReadGateway {
  return async () => ({ ok: true, citations });
}

test("normalizes every persisted occurrence in ordinal order and preserves duplicates", async () => {
  const events: string[] = [];
  const readGateway: CitationNormalizationReadGateway = async (workspace, observation) => {
    events.push(`read:${workspace}:${observation}`);
    return {
      ok: true,
      citations: [
        {
          citationOrdinal: 0,
          citationId: `${observationId}:grounding:0`,
          citedUrl: "HTTPS://BÜCHER.Example:443/a?utm_source=x&b=2&a=1#section",
        },
        {
          citationOrdinal: 1,
          citationId: `${observationId}:grounding:2`,
          citedUrl: "HTTPS://BÜCHER.Example:443/a?utm_source=x&b=2&a=1#section",
        },
        {
          citationOrdinal: 2,
          citationId: `${observationId}:grounding:3`,
          citedUrl: "javascript:alert(1)",
        },
      ],
    };
  };
  const persistGateway: CitationNormalizationPersistenceGateway = async (
    workspace,
    observation,
    citationId,
    normalization,
  ) => {
    events.push(`persist:${citationId}:${normalization.state}`);
    assert.equal(workspace, workspaceId);
    assert.equal(observation, observationId);
    if (citationId.endsWith(":grounding:3")) {
      assert.deepEqual(normalization, {
        methodVersion: "citation-url-v1",
        state: "excluded",
        canonicalUrl: null,
        canonicalDomain: null,
        exclusionReason: "unsupported_scheme",
      });
    } else {
      assert.deepEqual(normalization, {
        methodVersion: "citation-url-v1",
        state: "normalized",
        canonicalUrl:
          "https://xn--bcher-kva.example/a?utm_source=x&b=2&a=1#section",
        canonicalDomain: "xn--bcher-kva.example",
        exclusionReason: null,
      });
    }
    return { ok: true, citationId, replayed: citationId.endsWith(":grounding:2") };
  };

  const result = await normalizePersistedCitations(
    { workspaceId: workspaceId.toUpperCase(), observationId },
    readGateway,
    persistGateway,
  );

  assert.deepEqual(result, {
    ok: true,
    observationId,
    citationCount: 3,
    normalizedCount: 2,
    excludedCount: 1,
    replayedCount: 1,
    methodVersion: "citation-url-v1",
  });
  assert.deepEqual(events, [
    `read:${workspaceId}:${observationId}`,
    `persist:${observationId}:grounding:0:normalized`,
    `persist:${observationId}:grounding:2:normalized`,
    `persist:${observationId}:grounding:3:excluded`,
  ]);
});

test("accepts an observation with zero citations without fabricating evidence", async () => {
  let persistenceCalls = 0;
  const result = await normalizePersistedCitations(
    { workspaceId, observationId },
    reader([]),
    async () => {
      persistenceCalls += 1;
      throw new Error("persistence should not be called");
    },
  );

  assert.deepEqual(result, {
    ok: true,
    observationId,
    citationCount: 0,
    normalizedCount: 0,
    excludedCount: 0,
    replayedCount: 0,
    methodVersion: "citation-url-v1",
  });
  assert.equal(persistenceCalls, 0);
});

test("rejects malformed or unbounded database citation responses before persistence", async () => {
  const invalidSets: ReadonlyArray<ReadonlyArray<PersistedCitationOccurrence>> = [
    [
      {
        citationOrdinal: 1,
        citationId: "one",
        citedUrl: "https://example.com/one",
      },
      {
        citationOrdinal: 0,
        citationId: "two",
        citedUrl: "https://example.com/two",
      },
    ],
    [
      {
        citationOrdinal: 0,
        citationId: "duplicate",
        citedUrl: "https://example.com/one",
      },
      {
        citationOrdinal: 1,
        citationId: "duplicate",
        citedUrl: "https://example.com/two",
      },
    ],
    Array.from({ length: 51 }, (_, index) => ({
      citationOrdinal: index,
      citationId: `citation-${index}`,
      citedUrl: `https://example.com/${index}`,
    })),
  ];

  for (const citations of invalidSets) {
    let persistenceCalls = 0;
    const result = await normalizePersistedCitations(
      { workspaceId, observationId },
      reader(citations),
      async () => {
        persistenceCalls += 1;
        throw new Error("persistence should not be called");
      },
    );
    assert.deepEqual(result, {
      ok: false,
      stage: "read",
      code: "invalid_database_response",
    });
    assert.equal(persistenceCalls, 0);
  }
});

test("fails closed on read errors and never starts persistence", async () => {
  let persistenceCalls = 0;
  const result = await normalizePersistedCitations(
    { workspaceId, observationId },
    async () => ({ ok: false, code: "observation_not_found" }),
    async () => {
      persistenceCalls += 1;
      throw new Error("persistence should not be called");
    },
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "read",
    code: "observation_not_found",
  });
  assert.equal(persistenceCalls, 0);
});

test("stops on the first persistence failure so replay can resume safely", async () => {
  const persisted: string[] = [];
  const citations: ReadonlyArray<PersistedCitationOccurrence> = [0, 1, 2].map(
    (citationOrdinal) => ({
      citationOrdinal,
      citationId: `citation-${citationOrdinal}`,
      citedUrl: `https://example.com/${citationOrdinal}`,
    }),
  );
  const result = await normalizePersistedCitations(
    { workspaceId, observationId },
    reader(citations),
    async (_workspace, _observation, citationId) => {
      persisted.push(citationId);
      if (citationId === "citation-1")
        return { ok: false, code: "database_error" };
      return { ok: true, citationId, replayed: false };
    },
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "persist",
    citationId: "citation-1",
    code: "database_error",
  });
  assert.deepEqual(persisted, ["citation-0", "citation-1"]);
});

test("rejects invalid request identities before any gateway call", async () => {
  let calls = 0;
  const readGateway: CitationNormalizationReadGateway = async () => {
    calls += 1;
    return { ok: true, citations: [] };
  };
  const persistenceGateway: CitationNormalizationPersistenceGateway = async () => {
    calls += 1;
    return { ok: true, citationId: "unused", replayed: false };
  };

  assert.deepEqual(
    await normalizePersistedCitations(
      { workspaceId: "not-a-uuid", observationId },
      readGateway,
      persistenceGateway,
    ),
    { ok: false, stage: "request", code: "invalid_workspace_id" },
  );
  assert.deepEqual(
    await normalizePersistedCitations(
      { workspaceId, observationId: "not-a-uuid" },
      readGateway,
      persistenceGateway,
    ),
    { ok: false, stage: "request", code: "invalid_observation_id" },
  );
  assert.equal(calls, 0);
});

test("rejects a mismatched persistence response as database corruption", async () => {
  const result = await normalizePersistedCitations(
    { workspaceId, observationId },
    reader([
      {
        citationOrdinal: 0,
        citationId: "citation-0",
        citedUrl: "https://example.com/",
      },
    ]),
    async () => ({ ok: true, citationId: "citation-other", replayed: false }),
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "persist",
    citationId: "citation-0",
    code: "invalid_database_response",
  });
});
