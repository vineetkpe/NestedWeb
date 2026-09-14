import assert from "node:assert/strict";
import test from "node:test";

import {
  detectEntityMentions,
  MENTION_DETECTION_VERSION,
} from "./mention-detection.ts";

const CATALOG_ID = "d1000000-0000-4000-8000-000000000001";
const COMPANY_ID = "d2000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "d2000000-0000-4000-8000-000000000002";
const SECOND_PRODUCT_ID = "d2000000-0000-4000-8000-000000000003";
const COMPANY_ALIAS_ID = "d3000000-0000-4000-8000-000000000001";
const PRODUCT_ALIAS_ID = "d3000000-0000-4000-8000-000000000002";
const SECOND_PRODUCT_ALIAS_ID = "d3000000-0000-4000-8000-000000000003";

function catalog(
  entities: readonly Readonly<{
    entityId: string;
    entityKind: "company" | "product";
    canonicalName: string;
    aliases: readonly Readonly<{
      aliasId: string;
      aliasText: string;
      normalizedAlias: string;
      matchState: "eligible" | "ambiguous";
    }>[];
  }>[],
) {
  return {
    catalogId: CATALOG_ID,
    methodVersion: "entity-alias-v1",
    entities: entities.map((entity, entityOrdinal) => ({
      entityId: entity.entityId,
      entityOrdinal,
      entityKind: entity.entityKind,
      canonicalName: entity.canonicalName,
      aliases: entity.aliases.map((alias, aliasOrdinal) => ({
        aliasId: alias.aliasId,
        aliasOrdinal,
        aliasText: alias.aliasText,
        normalizedAlias: alias.normalizedAlias,
        matchState: alias.matchState,
      })),
    })),
  };
}

const ACME_CATALOG = catalog([
  {
    entityId: COMPANY_ID,
    entityKind: "company",
    canonicalName: "Acme Corporation",
    aliases: [
      {
        aliasId: COMPANY_ALIAS_ID,
        aliasText: "Acme",
        normalizedAlias: "acme",
        matchState: "eligible",
      },
    ],
  },
]);

test("detects repeated case-insensitive mentions with exact source spans", () => {
  const result = detectEntityMentions("ACME and acme.", ACME_CATALOG);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.methodVersion, MENTION_DETECTION_VERSION);
  assert.equal(result.aliasMethodVersion, "entity-alias-v1");
  assert.equal(result.catalogId, CATALOG_ID);
  assert.deepEqual(
    result.occurrences.map((occurrence) => ({
      state: occurrence.state,
      source: occurrence.source,
    })),
    [
      {
        state: "mention",
        source: { startUtf16: 0, endUtf16: 4, text: "ACME" },
      },
      {
        state: "mention",
        source: { startUtf16: 9, endUtf16: 13, text: "acme" },
      },
    ],
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.occurrences), true);
});

test("maps NFKC compatibility expansion and Unicode whitespace back to original UTF-16", () => {
  const labsCatalog = catalog([
    {
      entityId: COMPANY_ID,
      entityKind: "company",
      canonicalName: "Acme Labs",
      aliases: [
        {
          aliasId: COMPANY_ALIAS_ID,
          aliasText: "Acme Labs",
          normalizedAlias: "acme labs",
          matchState: "eligible",
        },
      ],
    },
  ]);

  const spaced = detectEntityMentions("ＡＣＭＥ\u2002\u2003LABS", labsCatalog);
  assert.equal(spaced.ok, true);
  if (spaced.ok) {
    assert.deepEqual(spaced.occurrences[0]?.source, {
      startUtf16: 0,
      endUtf16: 10,
      text: "ＡＣＭＥ\u2002\u2003LABS",
    });
  }

  const ffiCatalog = catalog([
    {
      entityId: COMPANY_ID,
      entityKind: "company",
      canonicalName: "FFI",
      aliases: [
        {
          aliasId: COMPANY_ALIAS_ID,
          aliasText: "ffi",
          normalizedAlias: "ffi",
          matchState: "eligible",
        },
      ],
    },
  ]);
  const expanded = detectEntityMentions("ﬃ", ffiCatalog);
  assert.equal(expanded.ok, true);
  if (expanded.ok) {
    assert.deepEqual(expanded.occurrences[0]?.source, {
      startUtf16: 0,
      endUtf16: 1,
      text: "ﬃ",
    });
  }
});

test("maps canonically composed matches to the exact decomposed source span", () => {
  const cafeCatalog = catalog([
    {
      entityId: COMPANY_ID,
      entityKind: "company",
      canonicalName: "Café",
      aliases: [
        {
          aliasId: COMPANY_ALIAS_ID,
          aliasText: "Café",
          normalizedAlias: "café",
          matchState: "eligible",
        },
      ],
    },
  ]);

  const result = detectEntityMentions("Cafe\u0301", cafeCatalog);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.occurrences[0]?.source, {
      startUtf16: 0,
      endUtf16: 5,
      text: "Cafe\u0301",
    });
  }
});

test("preserves punctuation and diacritic significance", () => {
  const punctuationCatalog = catalog([
    {
      entityId: COMPANY_ID,
      entityKind: "company",
      canonicalName: "Café",
      aliases: [
        {
          aliasId: COMPANY_ALIAS_ID,
          aliasText: "Café",
          normalizedAlias: "café",
          matchState: "eligible",
        },
        {
          aliasId: PRODUCT_ALIAS_ID,
          aliasText: "Acme.io",
          normalizedAlias: "acme.io",
          matchState: "eligible",
        },
      ],
    },
  ]);

  const result = detectEntityMentions(
    "Cafe Café AcmeXio Acme.iox Acme.io",
    punctuationCatalog,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.occurrences.map((occurrence) => occurrence.source),
    [
      { startUtf16: 5, endUtf16: 9, text: "Café" },
      { startUtf16: 27, endUtf16: 34, text: "Acme.io" },
    ],
  );
});

test("requires conservative Unicode token boundaries around word-like alias edges", () => {
  const result = detectEntityMentions(
    "SuperAcme Acme2 2Acme Acme-Acme (Acme)",
    ACME_CATALOG,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.occurrences.map((occurrence) => occurrence.source),
    [
      { startUtf16: 22, endUtf16: 26, text: "Acme" },
      { startUtf16: 27, endUtf16: 31, text: "Acme" },
      { startUtf16: 33, endUtf16: 37, text: "Acme" },
    ],
  );
});

test("reports UTF-16 offsets after astral characters", () => {
  const result = detectEntityMentions("😀 Acme", ACME_CATALOG);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.occurrences[0]?.source, {
      startUtf16: 3,
      endUtf16: 7,
      text: "Acme",
    });
  }
});

test("prefers the longest approved alias at the same normalized start", () => {
  const overlapCatalog = catalog([
    {
      entityId: COMPANY_ID,
      entityKind: "company",
      canonicalName: "Acme Corporation",
      aliases: [
        {
          aliasId: COMPANY_ALIAS_ID,
          aliasText: "Acme",
          normalizedAlias: "acme",
          matchState: "eligible",
        },
      ],
    },
    {
      entityId: PRODUCT_ID,
      entityKind: "product",
      canonicalName: "Acme Labs",
      aliases: [
        {
          aliasId: PRODUCT_ALIAS_ID,
          aliasText: "Acme Labs",
          normalizedAlias: "acme labs",
          matchState: "eligible",
        },
      ],
    },
  ]);

  const result = detectEntityMentions("Acme Labs and Acme", overlapCatalog);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.occurrences.map((occurrence) =>
      occurrence.state === "mention"
        ? {
            entityId: occurrence.entityId,
            aliasId: occurrence.aliasId,
            source: occurrence.source,
          }
        : occurrence,
    ),
    [
      {
        entityId: PRODUCT_ID,
        aliasId: PRODUCT_ALIAS_ID,
        source: { startUtf16: 0, endUtf16: 9, text: "Acme Labs" },
      },
      {
        entityId: COMPANY_ID,
        aliasId: COMPANY_ALIAS_ID,
        source: { startUtf16: 14, endUtf16: 18, text: "Acme" },
      },
    ],
  );
});

test("retains normalized collisions as one ambiguous occurrence without entity resolution", () => {
  const ambiguousCatalog = catalog([
    {
      entityId: COMPANY_ID,
      entityKind: "company",
      canonicalName: "Shared Company",
      aliases: [
        {
          aliasId: COMPANY_ALIAS_ID,
          aliasText: "Shared",
          normalizedAlias: "shared",
          matchState: "ambiguous",
        },
      ],
    },
    {
      entityId: PRODUCT_ID,
      entityKind: "product",
      canonicalName: "Shared Product",
      aliases: [
        {
          aliasId: PRODUCT_ALIAS_ID,
          aliasText: "shared",
          normalizedAlias: "shared",
          matchState: "ambiguous",
        },
      ],
    },
  ]);

  const result = detectEntityMentions("SHARED", ambiguousCatalog);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.occurrences.length, 1);
  const occurrence = result.occurrences[0];
  assert.equal(occurrence?.state, "ambiguous");
  if (occurrence?.state === "ambiguous") {
    assert.deepEqual(occurrence.source, {
      startUtf16: 0,
      endUtf16: 6,
      text: "SHARED",
    });
    assert.deepEqual(
      occurrence.candidates.map((candidate) => ({
        entityId: candidate.entityId,
        aliasId: candidate.aliasId,
      })),
      [
        { entityId: COMPANY_ID, aliasId: COMPANY_ALIAS_ID },
        { entityId: PRODUCT_ID, aliasId: PRODUCT_ALIAS_ID },
      ],
    );
  }
});

test("fails closed on forged normalization, collision state, IDs and catalog shape", () => {
  const forgedNormalization = catalog([
    {
      entityId: COMPANY_ID,
      entityKind: "company",
      canonicalName: "Acme",
      aliases: [
        {
          aliasId: COMPANY_ALIAS_ID,
          aliasText: "ＡＣＭＥ",
          normalizedAlias: "wrong",
          matchState: "eligible",
        },
      ],
    },
  ]);
  assert.deepEqual(detectEntityMentions("Acme", forgedNormalization), {
    ok: false,
    code: "invalid_catalog",
  });

  const forgedCollision = catalog([
    {
      entityId: COMPANY_ID,
      entityKind: "company",
      canonicalName: "Shared Company",
      aliases: [
        {
          aliasId: COMPANY_ALIAS_ID,
          aliasText: "Shared",
          normalizedAlias: "shared",
          matchState: "eligible",
        },
      ],
    },
    {
      entityId: PRODUCT_ID,
      entityKind: "product",
      canonicalName: "Shared Product",
      aliases: [
        {
          aliasId: PRODUCT_ALIAS_ID,
          aliasText: "shared",
          normalizedAlias: "shared",
          matchState: "eligible",
        },
      ],
    },
  ]);
  assert.deepEqual(detectEntityMentions("Shared", forgedCollision), {
    ok: false,
    code: "invalid_catalog",
  });

  const duplicateIds = catalog([
    {
      entityId: COMPANY_ID,
      entityKind: "company",
      canonicalName: "Acme",
      aliases: [
        {
          aliasId: COMPANY_ALIAS_ID,
          aliasText: "Acme",
          normalizedAlias: "acme",
          matchState: "eligible",
        },
      ],
    },
    {
      entityId: SECOND_PRODUCT_ID,
      entityKind: "product",
      canonicalName: "Other",
      aliases: [
        {
          aliasId: COMPANY_ALIAS_ID,
          aliasText: "Other",
          normalizedAlias: "other",
          matchState: "eligible",
        },
      ],
    },
  ]);
  assert.deepEqual(detectEntityMentions("Acme", duplicateIds), {
    ok: false,
    code: "invalid_catalog",
  });

  assert.deepEqual(
    detectEntityMentions("Acme", { ...ACME_CATALOG, extra: true }),
    { ok: false, code: "invalid_catalog" },
  );
});

test("bounds answer size and occurrence count without truncating evidence", () => {
  assert.deepEqual(detectEntityMentions("a".repeat(200_001), ACME_CATALOG), {
    ok: false,
    code: "invalid_answer_text",
  });

  assert.deepEqual(detectEntityMentions("Acme ".repeat(2_001), ACME_CATALOG), {
    ok: false,
    code: "occurrence_limit_exceeded",
  });
});

test("accepts an empty answer as a valid observation with no mentions", () => {
  const result = detectEntityMentions("", ACME_CATALOG);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.answerUtf16Length, 0);
    assert.deepEqual(result.occurrences, []);
  }
});

void SECOND_PRODUCT_ALIAS_ID;
