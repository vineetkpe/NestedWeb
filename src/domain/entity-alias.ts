export const ENTITY_ALIAS_NORMALIZATION_VERSION = "entity-alias-v1" as const;

const MAX_ENTITY_COUNT = 50;
const MAX_ALIASES_PER_ENTITY = 20;
const MAX_TOTAL_ALIAS_COUNT = 200;
const MAX_NAME_LENGTH = 120;
const CONTROL_CHARACTERS = /\p{Cc}/u;
const COLLAPSIBLE_WHITESPACE = /\s+/gu;

export type EntityKind = "company" | "product";
export type EntityAliasMatchState = "eligible" | "ambiguous";

export type PreparedEntityAlias = Readonly<{
  aliasOrdinal: number;
  aliasText: string;
  normalizedAlias: string;
  matchState: EntityAliasMatchState;
}>;

export type PreparedEntityAliasEntity = Readonly<{
  entityOrdinal: number;
  entityKind: EntityKind;
  canonicalName: string;
  aliases: readonly PreparedEntityAlias[];
}>;

export type PreparedEntityAliasCatalog = Readonly<{
  methodVersion: typeof ENTITY_ALIAS_NORMALIZATION_VERSION;
  entities: readonly PreparedEntityAliasEntity[];
  aliasCount: number;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function validDisplayName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= MAX_NAME_LENGTH &&
    value === value.trim() &&
    !CONTROL_CHARACTERS.test(value)
  );
}

/**
 * Versioned syntax normalization for explicitly approved entity aliases only.
 * It does not infer aliases, remove punctuation/diacritics, stem words, or
 * perform substring matching.
 */
export function normalizeEntityAlias(value: string): string | null {
  if (value.length < 1 || value.length > MAX_NAME_LENGTH) return null;
  if (CONTROL_CHARACTERS.test(value)) return null;

  const compatibilityNormalized = value.normalize("NFKC");
  if (compatibilityNormalized !== compatibilityNormalized.trim()) return null;

  const normalizedAlias = compatibilityNormalized
    .toLowerCase()
    .replace(COLLAPSIBLE_WHITESPACE, " ");

  if (
    normalizedAlias.length < 1 ||
    normalizedAlias.length > MAX_NAME_LENGTH ||
    CONTROL_CHARACTERS.test(normalizedAlias)
  )
    return null;

  return normalizedAlias;
}

/**
 * Validates an explicit customer-approved entity/alias catalog and computes
 * collision state. Cross-entity normalized collisions are retained as
 * ambiguous evidence; same-entity duplicates fail closed.
 */
export function prepareEntityAliasCatalog(
  value: unknown,
): PreparedEntityAliasCatalog | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_ENTITY_COUNT
  )
    return null;

  const provisional: Array<{
    entityOrdinal: number;
    entityKind: EntityKind;
    canonicalName: string;
    aliases: Array<{
      aliasOrdinal: number;
      aliasText: string;
      normalizedAlias: string;
    }>;
  }> = [];
  let companyCount = 0;
  let aliasCount = 0;

  for (const [entityOrdinal, candidate] of value.entries()) {
    if (
      !record(candidate) ||
      !hasExactKeys(candidate, ["entityKind", "canonicalName", "aliases"]) ||
      (candidate.entityKind !== "company" &&
        candidate.entityKind !== "product") ||
      !validDisplayName(candidate.canonicalName) ||
      !Array.isArray(candidate.aliases) ||
      candidate.aliases.length < 1 ||
      candidate.aliases.length > MAX_ALIASES_PER_ENTITY
    )
      return null;

    if (candidate.entityKind === "company") companyCount += 1;
    aliasCount += candidate.aliases.length;
    if (aliasCount > MAX_TOTAL_ALIAS_COUNT) return null;

    const aliases: Array<{
      aliasOrdinal: number;
      aliasText: string;
      normalizedAlias: string;
    }> = [];
    const entityNormalizedAliases = new Set<string>();

    for (const [aliasOrdinal, aliasValue] of candidate.aliases.entries()) {
      if (typeof aliasValue !== "string") return null;
      const normalizedAlias = normalizeEntityAlias(aliasValue);
      if (
        normalizedAlias === null ||
        entityNormalizedAliases.has(normalizedAlias)
      )
        return null;

      entityNormalizedAliases.add(normalizedAlias);
      aliases.push({
        aliasOrdinal,
        aliasText: aliasValue,
        normalizedAlias,
      });
    }

    provisional.push({
      entityOrdinal,
      entityKind: candidate.entityKind,
      canonicalName: candidate.canonicalName,
      aliases,
    });
  }

  if (companyCount !== 1) return null;

  const ownersByNormalizedAlias = new Map<string, Set<number>>();
  for (const entity of provisional) {
    for (const alias of entity.aliases) {
      let owners = ownersByNormalizedAlias.get(alias.normalizedAlias);
      if (owners === undefined) {
        owners = new Set<number>();
        ownersByNormalizedAlias.set(alias.normalizedAlias, owners);
      }
      owners.add(entity.entityOrdinal);
    }
  }

  const entities = Object.freeze(
    provisional.map((entity) =>
      Object.freeze({
        entityOrdinal: entity.entityOrdinal,
        entityKind: entity.entityKind,
        canonicalName: entity.canonicalName,
        aliases: Object.freeze(
          entity.aliases.map((alias) =>
            Object.freeze({
              aliasOrdinal: alias.aliasOrdinal,
              aliasText: alias.aliasText,
              normalizedAlias: alias.normalizedAlias,
              matchState:
                (ownersByNormalizedAlias.get(alias.normalizedAlias)?.size ??
                  0) > 1
                  ? ("ambiguous" as const)
                  : ("eligible" as const),
            }),
          ),
        ),
      }),
    ),
  );

  return Object.freeze({
    methodVersion: ENTITY_ALIAS_NORMALIZATION_VERSION,
    entities,
    aliasCount,
  });
}
