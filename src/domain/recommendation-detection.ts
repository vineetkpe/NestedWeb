import type { MentionOccurrence } from "./mention-detection.ts";

export const RECOMMENDATION_DETECTION_VERSION =
  "recommendation-detection-v1" as const;

const MENTION_METHOD_VERSION = "mention-detection-v1" as const;
const MAX_ANSWER_UTF16_LENGTH = 200_000;
const MAX_ALIAS_LENGTH = 120;
const MAX_CONTEXT_DISTANCE = 240;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const QUALIFICATION_PATTERN =
  /\b(?:maybe|might|may|could|perhaps|possibly|depending|unless|sometimes)\b|\bif\s+/iu;

const POSITIVE_BEFORE_PATTERNS = [
  /\b(?:i|we)\s+recommend\s*$/iu,
  /\brecommend\s*$/iu,
  /\bchoose\s*$/iu,
  /\bpick\s*$/iu,
  /\btry\s*$/iu,
  /\bgo\s+with\s*$/iu,
  /\bconsider\s*$/iu,
  /\b(?:best|top|strong|good)\s+(?:option|choice)\s+is\s*$/iu,
  /\bmy\s+pick\s+is\s*$/iu,
] as const;

const POSITIVE_AFTER_PATTERNS = [
  /^\s+is\s+(?:highly\s+)?recommended\b/iu,
  /^\s+is\s+(?:a|the)\s+(?:top|best|strong|good)\s+(?:option|choice)\b/iu,
  /^\s+(?:is|would\s+be)\s+my\s+pick\b/iu,
] as const;

const NEGATIVE_BEFORE_PATTERNS = [
  /\bdo\s+not\s+recommend\s*$/iu,
  /\bdon['’]t\s+recommend\s*$/iu,
  /\bwould\s+not\s+recommend\s*$/iu,
  /\bwouldn['’]t\s+recommend\s*$/iu,
  /\bavoid\s*$/iu,
  /\bskip\s*$/iu,
  /\bdo\s+not\s+choose\s*$/iu,
  /\bdon['’]t\s+choose\s*$/iu,
] as const;

const NEGATIVE_AFTER_PATTERNS = [
  /^\s+is\s+not\s+recommended\b/iu,
  /^\s+isn['’]t\s+recommended\b/iu,
  /^\s+should\s+be\s+avoided\b/iu,
  /^\s+is\s+(?:a|the)\s+poor\s+(?:option|choice)\b/iu,
  /^\s+is\s+not\s+(?:a|the)\s+good\s+(?:option|choice)\b/iu,
] as const;

type CueMatch = Readonly<{
  startUtf16: number;
  endUtf16: number;
  distance: number;
}>;

export type RecommendationEvidenceSpan = Readonly<{
  startUtf16: number;
  endUtf16: number;
  text: string;
}>;

export type RecommendationDetectionResult =
  | Readonly<{
      ok: true;
      methodVersion: typeof RECOMMENDATION_DETECTION_VERSION;
      mentionMethodVersion: typeof MENTION_METHOD_VERSION;
      occurrenceOrdinal: number;
      state: "recommended" | "not_recommended" | "unknown";
      evidence: RecommendationEvidenceSpan | null;
    }>
  | Readonly<{
      ok: false;
      code: "invalid_answer_text" | "invalid_mention";
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

function parseMention(
  answerText: string,
  value: unknown,
): MentionOccurrence | null {
  if (
    !record(value) ||
    !hasExactKeys(value, [
      "occurrenceOrdinal",
      "state",
      "entityId",
      "entityKind",
      "aliasId",
      "aliasText",
      "normalizedAlias",
      "source",
    ]) ||
    !Number.isSafeInteger(value.occurrenceOrdinal) ||
    (value.occurrenceOrdinal as number) < 0 ||
    (value.occurrenceOrdinal as number) > 1999 ||
    value.state !== "mention" ||
    typeof value.entityId !== "string" ||
    !UUID_PATTERN.test(value.entityId) ||
    (value.entityKind !== "company" && value.entityKind !== "product") ||
    typeof value.aliasId !== "string" ||
    !UUID_PATTERN.test(value.aliasId) ||
    typeof value.aliasText !== "string" ||
    value.aliasText.length < 1 ||
    value.aliasText.length > MAX_ALIAS_LENGTH ||
    typeof value.normalizedAlias !== "string" ||
    value.normalizedAlias.length < 1 ||
    value.normalizedAlias.length > MAX_ALIAS_LENGTH ||
    !record(value.source) ||
    !hasExactKeys(value.source, ["startUtf16", "endUtf16", "text"]) ||
    !Number.isSafeInteger(value.source.startUtf16) ||
    !Number.isSafeInteger(value.source.endUtf16) ||
    (value.source.startUtf16 as number) < 0 ||
    (value.source.endUtf16 as number) <= (value.source.startUtf16 as number) ||
    (value.source.endUtf16 as number) > answerText.length ||
    typeof value.source.text !== "string" ||
    value.source.text !==
      answerText.slice(
        value.source.startUtf16 as number,
        value.source.endUtf16 as number,
      )
  )
    return null;

  return value as unknown as MentionOccurrence;
}

function sentenceBounds(
  text: string,
  start: number,
  end: number,
): Readonly<{ start: number; end: number }> {
  let sentenceStart = start;
  while (sentenceStart > 0) {
    const character = text[sentenceStart - 1];
    if (character === "." || character === "!" || character === "?" || character === "\n")
      break;
    sentenceStart -= 1;
  }

  let sentenceEnd = end;
  while (sentenceEnd < text.length) {
    const character = text[sentenceEnd];
    if (character === "." || character === "!" || character === "?" || character === "\n")
      break;
    sentenceEnd += 1;
  }

  return Object.freeze({
    start: Math.max(sentenceStart, start - MAX_CONTEXT_DISTANCE),
    end: Math.min(sentenceEnd, end + MAX_CONTEXT_DISTANCE),
  });
}

function findBeforeCue(
  text: string,
  absoluteStart: number,
  mentionStart: number,
  patterns: readonly RegExp[],
): CueMatch | null {
  const prefix = text.slice(absoluteStart, mentionStart);
  let best: CueMatch | null = null;

  for (const pattern of patterns) {
    const match = pattern.exec(prefix);
    if (match?.index === undefined) continue;
    const cueStart = absoluteStart + match.index;
    const cueEnd = absoluteStart + match.index + match[0].length;
    const candidate = Object.freeze({
      startUtf16: cueStart,
      endUtf16: cueEnd,
      distance: mentionStart - cueEnd,
    });
    if (best === null || candidate.distance < best.distance) best = candidate;
  }

  return best;
}

function findAfterCue(
  text: string,
  mentionEnd: number,
  absoluteEnd: number,
  patterns: readonly RegExp[],
): CueMatch | null {
  const suffix = text.slice(mentionEnd, absoluteEnd);
  let best: CueMatch | null = null;

  for (const pattern of patterns) {
    const match = pattern.exec(suffix);
    if (match?.index === undefined) continue;
    const cueStart = mentionEnd + match.index;
    const cueEnd = mentionEnd + match.index + match[0].length;
    const candidate = Object.freeze({
      startUtf16: cueStart,
      endUtf16: cueEnd,
      distance: cueStart - mentionEnd,
    });
    if (best === null || candidate.distance < best.distance) best = candidate;
  }

  return best;
}

function nearestCue(
  before: CueMatch | null,
  after: CueMatch | null,
): CueMatch | null {
  if (before === null) return after;
  if (after === null) return before;
  return before.distance <= after.distance ? before : after;
}

function evidenceSpan(
  answerText: string,
  mention: MentionOccurrence,
  cue: CueMatch,
): RecommendationEvidenceSpan {
  const startUtf16 = Math.min(mention.source.startUtf16, cue.startUtf16);
  const endUtf16 = Math.max(mention.source.endUtf16, cue.endUtf16);
  return Object.freeze({
    startUtf16,
    endUtf16,
    text: answerText.slice(startUtf16, endUtf16),
  });
}

/**
 * Conservatively classifies one already-proven positive mention. This method
 * recognizes only explicit recommendation/avoidance cues. Mere presence,
 * ranking/list membership, comparison, sentiment, or prominence is not enough.
 */
export function detectRecommendationForMention(
  answerText: unknown,
  mentionValue: unknown,
): RecommendationDetectionResult {
  if (
    typeof answerText !== "string" ||
    answerText.length > MAX_ANSWER_UTF16_LENGTH
  )
    return { ok: false, code: "invalid_answer_text" };

  const mention = parseMention(answerText, mentionValue);
  if (mention === null) return { ok: false, code: "invalid_mention" };

  const bounds = sentenceBounds(
    answerText,
    mention.source.startUtf16,
    mention.source.endUtf16,
  );
  const sentence = answerText.slice(bounds.start, bounds.end);

  if (QUALIFICATION_PATTERN.test(sentence)) {
    return Object.freeze({
      ok: true,
      methodVersion: RECOMMENDATION_DETECTION_VERSION,
      mentionMethodVersion: MENTION_METHOD_VERSION,
      occurrenceOrdinal: mention.occurrenceOrdinal,
      state: "unknown",
      evidence: null,
    });
  }

  const negativeCue = nearestCue(
    findBeforeCue(
      answerText,
      bounds.start,
      mention.source.startUtf16,
      NEGATIVE_BEFORE_PATTERNS,
    ),
    findAfterCue(
      answerText,
      mention.source.endUtf16,
      bounds.end,
      NEGATIVE_AFTER_PATTERNS,
    ),
  );

  const positiveCue = nearestCue(
    findBeforeCue(
      answerText,
      bounds.start,
      mention.source.startUtf16,
      POSITIVE_BEFORE_PATTERNS,
    ),
    findAfterCue(
      answerText,
      mention.source.endUtf16,
      bounds.end,
      POSITIVE_AFTER_PATTERNS,
    ),
  );

  if (negativeCue !== null) {
    const positiveInsideNegative =
      positiveCue !== null &&
      positiveCue.startUtf16 >= negativeCue.startUtf16 &&
      positiveCue.endUtf16 <= negativeCue.endUtf16;
    if (positiveCue === null || positiveInsideNegative) {
      return Object.freeze({
        ok: true,
        methodVersion: RECOMMENDATION_DETECTION_VERSION,
        mentionMethodVersion: MENTION_METHOD_VERSION,
        occurrenceOrdinal: mention.occurrenceOrdinal,
        state: "not_recommended",
        evidence: evidenceSpan(answerText, mention, negativeCue),
      });
    }

    return Object.freeze({
      ok: true,
      methodVersion: RECOMMENDATION_DETECTION_VERSION,
      mentionMethodVersion: MENTION_METHOD_VERSION,
      occurrenceOrdinal: mention.occurrenceOrdinal,
      state: "unknown",
      evidence: null,
    });
  }

  if (positiveCue !== null) {
    return Object.freeze({
      ok: true,
      methodVersion: RECOMMENDATION_DETECTION_VERSION,
      mentionMethodVersion: MENTION_METHOD_VERSION,
      occurrenceOrdinal: mention.occurrenceOrdinal,
      state: "recommended",
      evidence: evidenceSpan(answerText, mention, positiveCue),
    });
  }

  return Object.freeze({
    ok: true,
    methodVersion: RECOMMENDATION_DETECTION_VERSION,
    mentionMethodVersion: MENTION_METHOD_VERSION,
    occurrenceOrdinal: mention.occurrenceOrdinal,
    state: "unknown",
    evidence: null,
  });
}
