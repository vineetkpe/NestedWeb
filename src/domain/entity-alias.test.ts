import assert from "node:assert/strict";
import test from "node:test";

import {
  ENTITY_ALIAS_NORMALIZATION_VERSION,
  normalizeEntityAlias,
  prepareEntityAliasCatalog,
} from "./entity-alias.ts";

test("normalizes aliases with NFKC, Unicode lowercase and collapsed whitespace", () => {
  assert.equal(normalizeEntityAlias("ＡＣＭＥ"), "acme");
  assert.equal(normalizeEntityAlias("Acme\u2002Labs"), "acme labs");
  assert.equal(normalizeEntityAlias("CAFÉ"), "café");
});

test("preserves punctuation and diacritics instead of inventing equivalence", () => {
  assert.equal(normalizeEntityAlias("Acme.io"), "acme.io");
  assert.equal(normalizeEntityAlias("Acme-IO"), "acme-io");
  assert.equal(normalizeEntityAlias("café"), "café");
  assert.notEqual(normalizeEntityAlias("café"), normalizeEntityAlias("cafe"));
});

test("rejects outer whitespace, controls, empty and oversized aliases", () => {
  for (const value of [
    " Acme",
    "Acme ",
    "Acme\nLabs",
    "",
    "a".repeat(121),
  ]) {
    assert.equal(normalizeEntityAlias(value), null);
  }
});

test("builds one company plus products and marks cross-entity collisions ambiguous", () => {
  const catalog = prepareEntityAliasCatalog([
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
  ]);

  assert.ok(catalog !== null);
  assert.equal(catalog.methodVersion, ENTITY_ALIAS_NORMALIZATION_VERSION);
  assert.equal(catalog.aliasCount, 5);
  assert.deepEqual(
    catalog.entities.map((entity) => ({
      entityOrdinal: entity.entityOrdinal,
      entityKind: entity.entityKind,
      aliases: entity.aliases.map((alias) => ({
        aliasOrdinal: alias.aliasOrdinal,
        normalizedAlias: alias.normalizedAlias,
        matchState: alias.matchState,
      })),
    })),
    [
      {
        entityOrdinal: 0,
        entityKind: "company",
        aliases: [
          {
            aliasOrdinal: 0,
            normalizedAlias: "acme corp",
            matchState: "eligible",
          },
          {
            aliasOrdinal: 1,
            normalizedAlias: "acme",
            matchState: "eligible",
          },
        ],
      },
      {
        entityOrdinal: 1,
        entityKind: "product",
        aliases: [
          {
            aliasOrdinal: 0,
            normalizedAlias: "lens",
            matchState: "eligible",
          },
          {
            aliasOrdinal: 1,
            normalizedAlias: "shared",
            matchState: "ambiguous",
          },
        ],
      },
      {
        entityOrdinal: 2,
        entityKind: "product",
        aliases: [
          {
            aliasOrdinal: 0,
            normalizedAlias: "shared",
            matchState: "ambiguous",
          },
        ],
      },
    ],
  );
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.entities), true);
});

test("rejects same-entity normalized duplicates instead of creating duplicate candidates", () => {
  assert.equal(
    prepareEntityAliasCatalog([
      {
        entityKind: "company",
        canonicalName: "Acme",
        aliases: ["Acme", "ＡＣＭＥ"],
      },
    ]),
    null,
  );
});

test("requires exactly one explicit company entity and strict input shape", () => {
  assert.equal(
    prepareEntityAliasCatalog([
      { entityKind: "product", canonicalName: "Lens", aliases: ["Lens"] },
    ]),
    null,
  );
  assert.equal(
    prepareEntityAliasCatalog([
      { entityKind: "company", canonicalName: "Acme", aliases: ["Acme"] },
      { entityKind: "company", canonicalName: "Other", aliases: ["Other"] },
    ]),
    null,
  );
  assert.equal(
    prepareEntityAliasCatalog([
      {
        entityKind: "company",
        canonicalName: "Acme",
        aliases: ["Acme"],
        extra: true,
      },
    ]),
    null,
  );
});
