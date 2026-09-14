import assert from "node:assert/strict";
import test from "node:test";

import {
  executeSupabaseEntityAliasPersistence,
  type SupabaseEntityAliasRpc,
} from "./supabase-entity-alias.ts";

const WORKSPACE_ID = "b1000000-0000-4000-8000-000000000001";
const PROJECT_ID = "b2000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "b3000000-0000-4000-8000-000000000001";

const request = {
  workspaceId: WORKSPACE_ID,
  projectId: PROJECT_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  entities: [
    {
      entityKind: "company",
      canonicalName: "Acme Corporation",
      aliases: ["Acme Corp", "ＡＣＭＥ"],
    },
    {
      entityKind: "product",
      canonicalName: "Acme Lens",
      aliases: ["Shared"],
    },
    {
      entityKind: "product",
      canonicalName: "Acme Shared",
      aliases: ["shared"],
    },
  ],
} as const;

function successfulData() {
  return {
    catalogId: "b4000000-0000-4000-8000-000000000001",
    methodVersion: "entity-alias-v1",
    requestFingerprint: "a".repeat(64),
    entityCount: 3,
    aliasCount: 4,
    replayed: false,
    entities: [
      {
        entityId: "b5000000-0000-4000-8000-000000000001",
        entityOrdinal: 0,
        entityKind: "company",
        canonicalName: "Acme Corporation",
        aliases: [
          {
            aliasId: "b6000000-0000-4000-8000-000000000001",
            aliasOrdinal: 0,
            aliasText: "Acme Corp",
            normalizedAlias: "acme corp",
            matchState: "eligible",
          },
          {
            aliasId: "b6000000-0000-4000-8000-000000000002",
            aliasOrdinal: 1,
            aliasText: "ＡＣＭＥ",
            normalizedAlias: "acme",
            matchState: "eligible",
          },
        ],
      },
      {
        entityId: "b5000000-0000-4000-8000-000000000002",
        entityOrdinal: 1,
        entityKind: "product",
        canonicalName: "Acme Lens",
        aliases: [
          {
            aliasId: "b6000000-0000-4000-8000-000000000003",
            aliasOrdinal: 0,
            aliasText: "Shared",
            normalizedAlias: "shared",
            matchState: "ambiguous",
          },
        ],
      },
      {
        entityId: "b5000000-0000-4000-8000-000000000003",
        entityOrdinal: 2,
        entityKind: "product",
        canonicalName: "Acme Shared",
        aliases: [
          {
            aliasId: "b6000000-0000-4000-8000-000000000004",
            aliasOrdinal: 0,
            aliasText: "shared",
            normalizedAlias: "shared",
            matchState: "ambiguous",
          },
        ],
      },
    ],
  };
}

test("sends only the bounded catalog RPC payload and strictly parses IDs/order", async () => {
  let name: string | null = null;
  let args: Readonly<Record<string, unknown>> | null = null;
  const rpc: SupabaseEntityAliasRpc = async (rpcName, rpcArgs) => {
    name = rpcName;
    args = rpcArgs;
    return { data: successfulData(), error: null };
  };

  const result = await executeSupabaseEntityAliasPersistence(request, rpc);

  assert.equal(name, "persist_entity_alias_catalog");
  assert.deepEqual(args, {
    p_workspace_id: WORKSPACE_ID,
    p_project_id: PROJECT_ID,
    p_idempotency_key: IDEMPOTENCY_KEY,
    p_catalog: {
      methodVersion: "entity-alias-v1",
      entities: [
        {
          entityKind: "company",
          canonicalName: "Acme Corporation",
          aliases: [
            {
              aliasText: "Acme Corp",
              normalizedAlias: "acme corp",
              matchState: "eligible",
            },
            {
              aliasText: "ＡＣＭＥ",
              normalizedAlias: "acme",
              matchState: "eligible",
            },
          ],
        },
        {
          entityKind: "product",
          canonicalName: "Acme Lens",
          aliases: [
            {
              aliasText: "Shared",
              normalizedAlias: "shared",
              matchState: "ambiguous",
            },
          ],
        },
        {
          entityKind: "product",
          canonicalName: "Acme Shared",
          aliases: [
            {
              aliasText: "shared",
              normalizedAlias: "shared",
              matchState: "ambiguous",
            },
          ],
        },
      ],
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.catalog.entityCount, 3);
    assert.equal(result.catalog.aliasCount, 4);
    assert.equal(
      result.catalog.entities[2]?.aliases[0]?.matchState,
      "ambiguous",
    );
  }
});

test("rejects database responses that change normalized evidence or IDs", async () => {
  const changed = successfulData();
  changed.entities[1]!.aliases[0]!.matchState = "eligible";

  const rpc: SupabaseEntityAliasRpc = async () => ({
    data: changed,
    error: null,
  });
  assert.deepEqual(await executeSupabaseEntityAliasPersistence(request, rpc), {
    ok: false,
    code: "invalid_database_response",
  });
});

test("maps project authorization and idempotency conflicts", async () => {
  const denied: SupabaseEntityAliasRpc = async () => ({
    data: null,
    error: { code: "42501", message: "Project access denied" },
  });
  assert.deepEqual(
    await executeSupabaseEntityAliasPersistence(request, denied),
    {
      ok: false,
      code: "project_access_denied",
    },
  );

  const conflict: SupabaseEntityAliasRpc = async () => ({
    data: null,
    error: {
      code: "22023",
      message: "Entity alias catalog idempotency conflict",
    },
  });
  assert.deepEqual(
    await executeSupabaseEntityAliasPersistence(request, conflict),
    { ok: false, code: "idempotency_conflict" },
  );
});

test("maps thrown RPC failures and malformed envelopes without exposing payloads", async () => {
  const thrown: SupabaseEntityAliasRpc = async () => {
    throw new Error("secret database detail");
  };
  assert.deepEqual(
    await executeSupabaseEntityAliasPersistence(request, thrown),
    {
      ok: false,
      code: "database_error",
    },
  );

  const malformed: SupabaseEntityAliasRpc = async () => ({ nope: true });
  assert.deepEqual(
    await executeSupabaseEntityAliasPersistence(request, malformed),
    { ok: false, code: "invalid_database_response" },
  );
});
