import { normalizeEntityAlias } from "./entity-alias.ts";

export const MENTION_DETECTION_VERSION = "mention-detection-v1" as const;

const ENTITY_ALIAS_METHOD_VERSION = "entity-alias-v1" as const;
const MAX_ANSWER_UTF16_LENGTH = 200_000;
const MAX_ENTITY_COUNT = 50;
const MAX_ALIASES_PER_ENTITY = 20;
const MAX_TOTAL_ALIAS_COUNT = 200;
const MAX_NAME_LENGTH = 120;
const MAX_OCCURRENCE_COUNT = 2_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTERS = /\p{Cc}/u;
const WORD_CHARACTER = /^[\p{L}\p{N}\p{M}]$/u;
const WHITESPACE_CHARACTER = /^\s$/u;
const COLLAPSIBLE_WHITESPACE = /\s+/gu;
const GRAPHEME_SEGMENTER = new Intl.Segmenter("und", { granularity: "grapheme" });

type SourceRange = {
  start: number;
  end: number;
};

type ParsedAlias = Readonly<{
  order: number;
  entityId: string;
  entityKind: "company" | "product";
  aliasId: string;
  aliasText: string;
  normalizedAlias: string;
  matchState: "eligible" | "ambiguous";
}>;

type AliasGroup = Readonly<{
  normalizedAlias: string;
  aliases: readonly ParsedAlias[];
  order: number;
  matchState: "eligible" | "ambiguous";
  requiresLeadingBoundary: boolean;
  requiresTrailingBoundary: boolean;
}>;

type ParsedCatalog = Readonly<{
  catalogId: string;
  groups: readonly AliasGroup[];
}>;

export type MentionSourceSpan = Readonly<{
  startUtf16: number;
  endUtf16: number;
  text: string;
}>;

export type MentionOccurrence = Readonly<{
  occurrenceOrdinal: number;
  state: "mention";
  entityId: string;
  entityKind: "company" | "product";
  aliasId: string;
  aliasText: string;
  normalizedAlias: string;
  source: MentionSourceSpan;
}>;

export type AmbiguousMentionCandidate = Readonly<{
  entityId: string;
  entityKind: "company" | "product";
  aliasId: string;
  aliasText: string;
}>;

export type AmbiguousMentionOccurrence = Readonly<{
  occurrenceOrdinal: number;
  state: "ambiguous";
  normalizedAlias: string;
  candidates: readonly AmbiguousMentionCandidate[];
  source: MentionSourceSpan;
}>;

export type MentionDetectionOccurrence =
  | MentionOccurrence
  | AmbiguousMentionOccurrence;

export type MentionDetectionResult =
  | Readonly<{
      ok: true;
      methodVersion: typeof MENTION_DETECTION_VERSION;
      aliasMethodVersion: typeof ENTITY_ALIAS_METHOD_VERSION;
      catalogId: string;
      answerUtf16Length: number;
      occurrences: readonly MentionDetectionOccurrence[];
    }>
  | Readonly<{
      ok: false;
      code:
        | "invalid_answer_text"
        | "invalid_catalog"
        | "normalization_unmappable"
        | "occurrence_limit_exceeded";
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

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
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

function firstCodePoint(value: string): string {
  const codePoint = value.codePointAt(0);
  if (codePoint === undefined) return "";
  return String.fromCodePoint(codePoint);
}

function lastCodePoint(value: string): string {
  const values = Array.from(value);
  return values.at(-1) ?? "";
}

function codePointAt(value: string, index: number): string | null {
  const codePoint = value.codePointAt(index);
  return codePoint === undefined ? null : String.fromCodePoint(codePoint);
}

function codePointBefore(value: string, index: number): string | null {
  if (index <= 0) return null;
  const trailing = value.charCodeAt(index - 1);
  if (
    trailing >= 0xdc00 &&
    trailing <= 0xdfff &&
    index >= 2
  ) {
    const leading = value.charCodeAt(index - 2);
    if (leading >= 0xd800 && leading <= 0xdbff) {
      return value.slice(index - 2, index);
    }
  }
  return value.slice(index - 1, index);
}

function isWordCharacter(value: string | null): boolean {
  return value !== null && WORD_CHARACTER.test(value);
}

function comparableText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(COLLAPSIBLE_WHITESPACE, " ");
}

function normalizeAnswerWithSourceMap(
  answerText: string,
): Readonly<{ text: string; ranges: readonly SourceRange[] }> | null {
  const nfkcParts: string[] = [];
  const nfkcRanges: SourceRange[] = [];

  for (const part of GRAPHEME_SEGMENTER.segment(answerText)) {
    const sourceStart = part.index;
    const sourceEnd = sourceStart + part.segment.length;
    const normalizedPart = part.segment.normalize("NFKC");
    nfkcParts.push(normalizedPart);
    for (let index = 0; index < normalizedPart.length; index += 1) {
      nfkcRanges.push({ start: sourceStart, end: sourceEnd });
    }
  }

  const nfkcText = nfkcParts.join("");
  if (nfkcText !== answerText.normalize("NFKC")) return null;

  const loweredText = nfkcText.toLowerCase();
  const loweredRanges: SourceRange[] = [];
  let sourceCursor = 0;
  let loweredCursor = 0;

  while (sourceCursor < nfkcText.length) {
    const sourceCodePoint = codePointAt(nfkcText, sourceCursor);
    if (sourceCodePoint === null) return null;
    const sourceWidth = sourceCodePoint.length;
    const localLowerWidth = sourceCodePoint.toLowerCase().length;
    const firstRange = nfkcRanges[sourceCursor];
    const lastRange = nfkcRanges[sourceCursor + sourceWidth - 1];
    if (firstRange === undefined || lastRange === undefined) return null;

    for (let index = 0; index < localLowerWidth; index += 1) {
      loweredRanges.push({ start: firstRange.start, end: lastRange.end });
    }

    sourceCursor += sourceWidth;
    loweredCursor += localLowerWidth;
  }

  if (loweredCursor !== loweredText.length) return null;

  const outputParts: string[] = [];
  const outputRanges: SourceRange[] = [];
  let cursor = 0;
  let previousWasWhitespace = false;

  while (cursor < loweredText.length) {
    const character = codePointAt(loweredText, cursor);
    if (character === null) return null;
    const width = character.length;
    const firstRange = loweredRanges[cursor];
    const lastRange = loweredRanges[cursor + width - 1];
    if (firstRange === undefined || lastRange === undefined) return null;
    const sourceRange = { start: firstRange.start, end: lastRange.end };

    if (WHITESPACE_CHARACTER.test(character)) {
      if (previousWasWhitespace) {
        const existing = outputRanges.at(-1);
        if (existing === undefined) return null;
        existing.end = sourceRange.end;
      } else {
        outputParts.push(" ");
        outputRanges.push(sourceRange);
        previousWasWhitespace = true;
      }
    } else {
      outputParts.push(character);
      for (let index = 0; index < width; index += 1) {
        outputRanges.push({ ...sourceRange });
      }
      previousWasWhitespace = false;
    }

    cursor += width;
  }

  const text = outputParts.join("");
  if (text !== comparableText(answerText) || outputRanges.length !== text.length) {
    return null;
  }

  return Object.freeze({ text, ranges: Object.freeze(outputRanges) });
}

function parseCatalog(value: unknown): ParsedCatalog | null {
  if (
    !record(value) ||
    !hasExactKeys(value, ["catalogId", "methodVersion", "entities"]) ||
    !validUuid(value.catalogId) ||
    value.methodVersion !== ENTITY_ALIAS_METHOD_VERSION ||
    !Array.isArray(value.entities) ||
    value.entities.length < 1 ||
    value.entities.length > MAX_ENTITY_COUNT
  )
    return null;

  const aliases: ParsedAlias[] = [];
  const entityIds = new Set<string>();
  const aliasIds = new Set<string>();
  const aliasesByNormalized = new Map<string, ParsedAlias[]>();
  let companyCount = 0;
  let totalAliasCount = 0;
  let order = 0;

  for (const [entityOrdinal, entityValue] of value.entities.entries()) {
    if (
      !record(entityValue) ||
      !hasExactKeys(entityValue, [
        "entityId",
        "entityOrdinal",
        "entityKind",
        "canonicalName",
        "aliases",
      ]) ||
      !validUuid(entityValue.entityId) ||
      entityIds.has(entityValue.entityId.toLowerCase()) ||
      entityValue.entityOrdinal !== entityOrdinal ||
      (entityValue.entityKind !== "company" && entityValue.entityKind !== "product") ||
      !validDisplayName(entityValue.canonicalName) ||
      !Array.isArray(entityValue.aliases) ||
      entityValue.aliases.length < 1 ||
      entityValue.aliases.length > MAX_ALIASES_PER_ENTITY
    )
      return null;

    const entityId = entityValue.entityId.toLowerCase();
    entityIds.add(entityId);
    if (entityValue.entityKind === "company") companyCount += 1;

    const entityNormalizedAliases = new Set<string>();
    for (const [aliasOrdinal, aliasValue] of entityValue.aliases.entries()) {
      totalAliasCount += 1;
      if (totalAliasCount > MAX_TOTAL_ALIAS_COUNT) return null;
      if (
        !record(aliasValue) ||
        !hasExactKeys(aliasValue, [
          "aliasId",
          "aliasOrdinal",
          "aliasText",
          "normalizedAlias",
          "matchState",
        ]) ||
        !validUuid(aliasValue.aliasId) ||
        aliasIds.has(aliasValue.aliasId.toLowerCase()) ||
        aliasValue.aliasOrdinal !== aliasOrdinal ||
        typeof aliasValue.aliasText !== "string" ||
        typeof aliasValue.normalizedAlias !== "string" ||
        (aliasValue.matchState !== "eligible" && aliasValue.matchState !== "ambiguous")
      )
        return null;

      const normalizedAlias = normalizeEntityAlias(aliasValue.aliasText);
      if (
        normalizedAlias === null ||
        normalizedAlias !== aliasValue.normalizedAlias ||
        entityNormalizedAliases.has(normalizedAlias)
      )
        return null;

      const aliasId = aliasValue.aliasId.toLowerCase();
      aliasIds.add(aliasId);
      entityNormalizedAliases.add(normalizedAlias);
      const parsedAlias = Object.freeze({
        order,
        entityId,
        entityKind: entityValue.entityKind,
        aliasId,
        aliasText: aliasValue.aliasText,
        normalizedAlias,
        matchState: aliasValue.matchState,
      });
      aliases.push(parsedAlias);
      const group = aliasesByNormalized.get(normalizedAlias) ?? [];
      group.push(parsedAlias);
      aliasesByNormalized.set(normalizedAlias, group);
      order += 1;
    }
  }

  if (companyCount !== 1 || aliases.length < 1) return null;

  const groups: AliasGroup[] = [];
  for (const [normalizedAlias, groupAliases] of aliasesByNormalized) {
    const ownerIds = new Set(groupAliases.map((alias) => alias.entityId));
    const expectedState = ownerIds.size > 1 ? "ambiguous" : "eligible";
    if (groupAliases.some((alias) => alias.matchState !== expectedState)) return null;
    if (expectedState === "eligible" && groupAliases.length !== 1) return null;

    const sortedAliases = [...groupAliases].sort((left, right) => left.order - right.order);
    groups.push(
      Object.freeze({
        normalizedAlias,
        aliases: Object.freeze(sortedAliases),
        order: sortedAliases[0]?.order ?? Number.MAX_SAFE_INTEGER,
        matchState: expectedState,
        requiresLeadingBoundary: isWordCharacter(firstCodePoint(normalizedAlias)),
        requiresTrailingBoundary: isWordCharacter(lastCodePoint(normalizedAlias)),
      }),
    );
  }

  groups.sort((left, right) => {
    const lengthDifference = right.normalizedAlias.length - left.normalizedAlias.length;
    return lengthDifference !== 0 ? lengthDifference : left.order - right.order;
  });

  return Object.freeze({
    catalogId: value.catalogId.toLowerCase(),
    groups: Object.freeze(groups),
  });
}

function boundaryMatches(
  text: string,
  start: number,
  end: number,
  group: AliasGroup,
): boolean {
  if (
    group.requiresLeadingBoundary &&
    isWordCharacter(codePointBefore(text, start))
  )
    return false;
  if (
    group.requiresTrailingBoundary &&
    isWordCharacter(codePointAt(text, end))
  )
    return false;
  return true;
}

function buildOccurrence(
  answerText: string,
  normalizedText: string,
  ranges: readonly SourceRange[],
  start: number,
  group: AliasGroup,
  occurrenceOrdinal: number,
): MentionDetectionOccurrence | null {
  const end = start + group.normalizedAlias.length;
  const firstRange = ranges[start];
  const lastRange = ranges[end - 1];
  if (firstRange === undefined || lastRange === undefined) return null;

  const source = Object.freeze({
    startUtf16: firstRange.start,
    endUtf16: lastRange.end,
    text: answerText.slice(firstRange.start, lastRange.end),
  });
  if (comparableText(source.text) !== normalizedText.slice(start, end)) return null;

  if (group.matchState === "eligible") {
    const alias = group.aliases[0];
    if (alias === undefined) return null;
    return Object.freeze({
      occurrenceOrdinal,
      state: "mention",
      entityId: alias.entityId,
      entityKind: alias.entityKind,
      aliasId: alias.aliasId,
      aliasText: alias.aliasText,
      normalizedAlias: alias.normalizedAlias,
      source,
    });
  }

  return Object.freeze({
    occurrenceOrdinal,
    state: "ambiguous",
    normalizedAlias: group.normalizedAlias,
    candidates: Object.freeze(
      group.aliases.map((alias) =>
        Object.freeze({
          entityId: alias.entityId,
          entityKind: alias.entityKind,
          aliasId: alias.aliasId,
          aliasText: alias.aliasText,
        }),
      ),
    ),
    source,
  });
}

/**
 * Detects explicit approved entity aliases in supplied answer text. A positive
 * mention means only that the alias text occurs with the documented boundary
 * rules; it does not imply recommendation, selection, sentiment, or support.
 */
export function detectEntityMentions(
  answerText: unknown,
  catalog: unknown,
): MentionDetectionResult {
  if (
    typeof answerText !== "string" ||
    answerText.length > MAX_ANSWER_UTF16_LENGTH
  )
    return { ok: false, code: "invalid_answer_text" };

  const parsedCatalog = parseCatalog(catalog);
  if (parsedCatalog === null) return { ok: false, code: "invalid_catalog" };

  const normalized = normalizeAnswerWithSourceMap(answerText);
  if (normalized === null)
    return { ok: false, code: "normalization_unmappable" };

  const groupsByFirstCodePoint = new Map<string, AliasGroup[]>();
  for (const group of parsedCatalog.groups) {
    const key = firstCodePoint(group.normalizedAlias);
    const groups = groupsByFirstCodePoint.get(key) ?? [];
    groups.push(group);
    groupsByFirstCodePoint.set(key, groups);
  }

  const occurrences: MentionDetectionOccurrence[] = [];
  let cursor = 0;
  while (cursor < normalized.text.length) {
    const current = codePointAt(normalized.text, cursor);
    if (current === null) return { ok: false, code: "normalization_unmappable" };
    const candidates = groupsByFirstCodePoint.get(current) ?? [];
    let matchedGroup: AliasGroup | null = null;

    for (const group of candidates) {
      const end = cursor + group.normalizedAlias.length;
      if (
        normalized.text.startsWith(group.normalizedAlias, cursor) &&
        boundaryMatches(normalized.text, cursor, end, group)
      ) {
        matchedGroup = group;
        break;
      }
    }

    if (matchedGroup === null) {
      cursor += current.length;
      continue;
    }

    if (occurrences.length >= MAX_OCCURRENCE_COUNT)
      return { ok: false, code: "occurrence_limit_exceeded" };
    const occurrence = buildOccurrence(
      answerText,
      normalized.text,
      normalized.ranges,
      cursor,
      matchedGroup,
      occurrences.length,
    );
    if (occurrence === null)
      return { ok: false, code: "normalization_unmappable" };
    occurrences.push(occurrence);
    cursor += matchedGroup.normalizedAlias.length;
  }

  return Object.freeze({
    ok: true,
    methodVersion: MENTION_DETECTION_VERSION,
    aliasMethodVersion: ENTITY_ALIAS_METHOD_VERSION,
    catalogId: parsedCatalog.catalogId,
    answerUtf16Length: answerText.length,
    occurrences: Object.freeze(occurrences),
  });
}
