import assert from "node:assert/strict";
import test from "node:test";
import {
  executeSupabaseCitationNormalization,
  type SupabaseCitationNormalizationRpc,
} from "./supabase-citation-normalization.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const observationId = "22222222-2222-4222-8222-222222222222";

function persistedResponse(
  citationId: string,
  state: "normalized" | "excluded",
  replayed = false,
) {
  return {
    data: {
      observationId,
      citationId,
      methodVersion: "citation-url-v1",
      state,
      replayed,
    },
    error: null,
  };
}

test("maps bounded read and persistence RPCs without deduplicating occurrences", async () => {
  const events: string[] = [];
  const rpc: SupabaseCitationNormalizationRpc = async (name, args) => {
    events.push(name);
    if (name === "list_raw_citations_for_normalization") {
      assert.deepEqual(args, {
        p_workspace_id: workspaceId,
        p_observation_id: observationId,
      });
      return {
        data: {
          observationId,
          citations: [
            {
              citationOrdinal: 0,
              citationId: `${observationId}:grounding:0`,
              citedUrl: "https://example.com/source",
            },
            {
              citationOrdinal: 1,
              citationId: `${observationId}:grounding:2`,
              citedUrl: "https://example.com/source",
            },
            {
              citationOrdinal: 2,
              citationId: `${observationId}:grounding:3`,
              citedUrl: "mailto:source@example.com",
            },
          ],
        },
        error: null,
      };
    }

    const citationId = args.p_citation_id;
    assert.ok(typeof citationId === "string");
    const normalization = args.p_normalization;
    assert.ok(
      typeof normalization === "object" &&
        normalization !== null &&
        "state" in normalization,
    );
    const state = normalization.state;
    assert.ok(state === "normalized" || state === "excluded");
    return persistedResponse(
      citationId,
      state,
      citationId.endsWith(":grounding:2"),
    );
  };

  const result = await executeSupabaseCitationNormalization(
    { workspaceId, observationId },
    rpc,
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
    "list_raw_citations_for_normalization",
    "persist_citation_url_normalization",
    "persist_citation_url_normalization",
    "persist_citation_url_normalization",
  ]);
});

test("maps a missing raw observation and performs no persistence", async () => {
  const events: string[] = [];
  const result = await executeSupabaseCitationNormalization(
    { workspaceId, observationId },
    async (name) => {
      events.push(name);
      return {
        data: null,
        error: { code: "P0001", message: "Raw observation not found" },
      };
    },
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "read",
    code: "observation_not_found",
  });
  assert.deepEqual(events, ["list_raw_citations_for_normalization"]);
});

test("rejects malformed read envelopes before persistence", async () => {
  for (const response of [
    null,
    { data: { observationId, citations: [] } },
    { data: { observationId: workspaceId, citations: [] }, error: null },
    {
      data: {
        observationId,
        citations: [
          {
            citationOrdinal: 0,
            citationId: "citation-0",
            citedUrl: "https://example.com/",
            extra: true,
          },
        ],
      },
      error: null,
    },
  ]) {
    const events: string[] = [];
    const result = await executeSupabaseCitationNormalization(
      { workspaceId, observationId },
      async (name) => {
        events.push(name);
        return response;
      },
    );
    assert.deepEqual(result, {
      ok: false,
      stage: "read",
      code: "invalid_database_response",
    });
    assert.deepEqual(events, ["list_raw_citations_for_normalization"]);
  }
});

test("maps persistence conflict and stops further RPCs", async () => {
  const events: string[] = [];
  const result = await executeSupabaseCitationNormalization(
    { workspaceId, observationId },
    async (name, args) => {
      events.push(name);
      if (name === "list_raw_citations_for_normalization")
        return {
          data: {
            observationId,
            citations: [
              {
                citationOrdinal: 0,
                citationId: "citation-0",
                citedUrl: "https://example.com/0",
              },
              {
                citationOrdinal: 1,
                citationId: "citation-1",
                citedUrl: "https://example.com/1",
              },
            ],
          },
          error: null,
        };

      assert.equal(args.p_citation_id, "citation-0");
      return {
        data: null,
        error: {
          code: "22023",
          message:
            "Citation normalization replay conflicts with stored evidence",
        },
      };
    },
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "persist",
    citationId: "citation-0",
    code: "idempotency_conflict",
  });
  assert.deepEqual(events, [
    "list_raw_citations_for_normalization",
    "persist_citation_url_normalization",
  ]);
});

test("rejects persistence responses that do not echo exact provenance", async () => {
  const result = await executeSupabaseCitationNormalization(
    { workspaceId, observationId },
    async (name) => {
      if (name === "list_raw_citations_for_normalization")
        return {
          data: {
            observationId,
            citations: [
              {
                citationOrdinal: 0,
                citationId: "citation-0",
                citedUrl: "https://example.com/",
              },
            ],
          },
          error: null,
        };
      return {
        data: {
          observationId,
          citationId: "citation-other",
          methodVersion: "citation-url-v1",
          state: "normalized",
          replayed: false,
        },
        error: null,
      };
    },
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "persist",
    citationId: "citation-0",
    code: "invalid_database_response",
  });
});

test("maps thrown RPC failures to database errors", async () => {
  const result = await executeSupabaseCitationNormalization(
    { workspaceId, observationId },
    async () => {
      throw new Error("database unavailable");
    },
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "read",
    code: "database_error",
  });
});
