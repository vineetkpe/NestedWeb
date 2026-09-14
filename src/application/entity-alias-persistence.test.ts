import assert from "node:assert/strict";
import test from "node:test";

import {
  persistEntityAliasCatalog,
  type EntityAliasCatalogPersistenceGateway,
  type ValidatedEntityAliasCatalogPersistenceRequest,
} from "./entity-alias-persistence.ts";

const WORKSPACE_ID = "a1000000-0000-4000-8000-000000000001";
const PROJECT_ID = "a2000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "a3000000-0000-4000-8000-000000000001";

const ENTITIES = [
  {
    entityKind: "company",
    canonicalName: "Acme Corporation",
    aliases: ["Acme Corp", "ＡＣＭＥ"],
  },
  {
    entityKind: "product",
    canonicalName: "Acme Lens",
    aliases: ["Lens", "Shared"],
  },
  {
    entityKind: "product",
    canonicalName: "Acme Shared",
    aliases: ["shared"],
  },
] as const;

test("validates IDs and passes the prepared immutable catalog to the gateway", async () => {
  let received: ValidatedEntityAliasCatalogPersistenceRequest | null = null;
  const gateway: EntityAliasCatalogPersistenceGateway = async (request) => {
    received = request;
    return {
      ok: false,
      code: "database_error",
    };
  };

  const result = await persistEntityAliasCatalog(
    {
      workspaceId: WORKSPACE_ID.toUpperCase(),
      projectId: PROJECT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      entities: ENTITIES,
    },
    gateway,
  );

  assert.deepEqual(result, { ok: false, code: "database_error" });
  assert.ok(received !== null);
  assert.equal(received.workspaceId, WORKSPACE_ID);
  assert.equal(received.projectId, PROJECT_ID);
  assert.equal(received.idempotencyKey, IDEMPOTENCY_KEY);
  assert.equal(received.catalog.methodVersion, "entity-alias-v1");
  assert.equal(received.catalog.aliasCount, 5);
  assert.equal(received.catalog.entities[1]?.aliases[1]?.matchState, "ambiguous");
  assert.equal(received.catalog.entities[2]?.aliases[0]?.matchState, "ambiguous");
  assert.equal(Object.isFrozen(received.catalog), true);
});

test("fails before persistence for malformed identity or alias catalogs", async () => {
  let calls = 0;
  const gateway: EntityAliasCatalogPersistenceGateway = async () => {
    calls += 1;
    return { ok: false, code: "database_error" };
  };

  assert.deepEqual(
    await persistEntityAliasCatalog(
      {
        workspaceId: "bad",
        projectId: PROJECT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        entities: ENTITIES,
      },
      gateway,
    ),
    { ok: false, code: "invalid_workspace_id" },
  );

  assert.deepEqual(
    await persistEntityAliasCatalog(
      {
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        entities: [
          {
            entityKind: "company",
            canonicalName: "Acme",
            aliases: ["Acme", "ＡＣＭＥ"],
          },
        ],
      },
      gateway,
    ),
    { ok: false, code: "invalid_entities" },
  );

  assert.equal(calls, 0);
});
