import assert from "node:assert/strict";
import test from "node:test";

import {
  executeSupabaseScanIntelligence,
  type SupabaseScanIntelligenceRpc,
  type SupabaseScanIntelligenceRpcName,
} from "./supabase-scan-intelligence.ts";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const CATALOG_ID = "33333333-3333-4333-8333-333333333333";
const OBSERVATION_ID = "44444444-4444-4444-8444-444444444444";
const ENTITY_ID = "55555555-5555-4555-8555-555555555555";
const ALIAS_ID = "66666666-6666-4666-8666-666666666666";

test("rejects invalid request before invoking RPCs", async () => {
  let rpcCalled = false;
  const rpc: SupabaseScanIntelligenceRpc = async () => {
    rpcCalled = true;
    return { ok: true, data: {} };
  };

  const result = await executeSupabaseScanIntelligence(
    {
      workspaceId: "bad-id",
      catalogId: CATALOG_ID,
      observationIds: [OBSERVATION_ID],
    },
    rpc,
  );

  assert.deepEqual(result, {
    ok: false,
    stage: "request",
    code: "invalid_workspace_id",
  });
  assert.equal(rpcCalled, false);
});

test("executes end-to-end Supabase intelligence RPC sequence for observations", async () => {
  const rpcCalls: {
    name: SupabaseScanIntelligenceRpcName;
    args: Record<string, unknown>;
  }[] = [];

  const rpc: SupabaseScanIntelligenceRpc = async (name, args) => {
    rpcCalls.push({ name, args });

    if (name === "list_raw_citations_for_normalization") {
      return {
        data: {
          observationId: OBSERVATION_ID,
          citations: [
            {
              citationOrdinal: 0,
              citationId: `${OBSERVATION_ID}:grounding:0`,
              citedUrl: "https://example.com/source?utm_source=test#anchor",
            },
          ],
        },
        error: null,
      };
    }

    if (name === "persist_citation_url_normalization") {
      return {
        data: {
          observationId: OBSERVATION_ID,
          citationId: `${OBSERVATION_ID}:grounding:0`,
          methodVersion: "citation-url-v1",
          state: "normalized",
          replayed: false,
        },
        error: null,
      };
    }

    if (name === "read_mention_detection_input") {
      return {
        data: {
          projectId: PROJECT_ID,
          observationId: OBSERVATION_ID,
          answerText: "We recommend Acme for visibility.",
          catalog: {
            catalogId: CATALOG_ID,
            methodVersion: "entity-alias-v1",
            entities: [
              {
                entityId: ENTITY_ID,
                entityOrdinal: 0,
                entityKind: "company",
                canonicalName: "Acme Inc",
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
        },
        error: null,
      };
    }

    if (name === "persist_mention_detection") {
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
    }

    throw new Error(`Unexpected RPC call: ${name}`);
  };

  const result = await executeSupabaseScanIntelligence(
    {
      workspaceId: WORKSPACE_ID,
      catalogId: CATALOG_ID,
      observationIds: [OBSERVATION_ID],
    },
    rpc,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.successfulObservations, 1);
  assert.equal(result.failedObservations, 0);
  assert.equal(result.totals.citationCount, 1);
  assert.equal(result.totals.normalizedCitationCount, 1);
  assert.equal(result.totals.mentionCount, 1);

  assert.deepEqual(
    rpcCalls.map((c) => c.name),
    [
      "list_raw_citations_for_normalization",
      "persist_citation_url_normalization",
      "read_mention_detection_input",
      "persist_mention_detection",
    ],
  );
});
