import assert from "node:assert/strict";
import test from "node:test";

import {
  detectRecommendationForMention,
  RECOMMENDATION_DETECTION_VERSION,
} from "./recommendation-detection.ts";

const ENTITY_ID = "e2000000-0000-4000-8000-000000000001";
const ALIAS_ID = "e3000000-0000-4000-8000-000000000001";

function mention(answerText: string, sourceText = "Acme") {
  const startUtf16 = answerText.indexOf(sourceText);
  assert.notEqual(startUtf16, -1);
  return {
    occurrenceOrdinal: 0,
    state: "mention" as const,
    entityId: ENTITY_ID,
    entityKind: "company" as const,
    aliasId: ALIAS_ID,
    aliasText: sourceText,
    normalizedAlias: "acme",
    source: {
      startUtf16,
      endUtf16: startUtf16 + sourceText.length,
      text: sourceText,
    },
  };
}

test("detects an explicit direct recommendation with exact support span", () => {
  const answer = "I recommend Acme for small teams.";
  const result = detectRecommendationForMention(answer, mention(answer));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.methodVersion, RECOMMENDATION_DETECTION_VERSION);
  assert.equal(result.mentionMethodVersion, "mention-detection-v1");
  assert.equal(result.state, "recommended");
  assert.deepEqual(result.evidence, {
    startUtf16: 0,
    endUtf16: answer.indexOf("Acme") + 4,
    text: "I recommend Acme",
  });
});

test("detects explicit avoidance separately from recommendation", () => {
  const answer = "Avoid Acme for this workload.";
  const result = detectRecommendationForMention(answer, mention(answer));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "not_recommended");
  assert.deepEqual(result.evidence, {
    startUtf16: 0,
    endUtf16: answer.indexOf("Acme") + 4,
    text: "Avoid Acme",
  });
});

test("negated recommendation does not become a positive recommendation", () => {
  const answer = "I do not recommend Acme for this case.";
  const result = detectRecommendationForMention(answer, mention(answer));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "not_recommended");
  assert.equal(result.evidence?.text, "do not recommend Acme");
});

test("recognizes an explicit post-mention endorsement", () => {
  const answer = "Acme is a top choice for teams.";
  const result = detectRecommendationForMention(answer, mention(answer));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "recommended");
  assert.equal(result.evidence?.text, "Acme is a top choice");
});

test("mere mention remains unknown", () => {
  const answer = "Acme supports team workspaces.";
  const result = detectRecommendationForMention(answer, mention(answer));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    { state: result.state, evidence: result.evidence },
    { state: "unknown", evidence: null },
  );
});

test("neutral list membership remains unknown", () => {
  const answer = "Available options include Acme, Beta, and Gamma.";
  const result = detectRecommendationForMention(answer, mention(answer));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "unknown");
  assert.equal(result.evidence, null);
});

test("unsupported comparison remains unknown", () => {
  const answer = "Acme is faster than Beta on this benchmark.";
  const result = detectRecommendationForMention(answer, mention(answer));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "unknown");
});

test("qualified recommendation language fails conservatively to unknown", () => {
  const answer = "I might recommend Acme for some teams.";
  const result = detectRecommendationForMention(answer, mention(answer));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "unknown");
  assert.equal(result.evidence, null);
});

test("conflicting positive and negative cues remain unknown", () => {
  const answer = "I recommend Acme is not recommended.";
  const result = detectRecommendationForMention(answer, mention(answer));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "unknown");
  assert.equal(result.evidence, null);
});

test("preserves original UTF-16 offsets and Unicode mention text", () => {
  const answer = "😀 I RECOMMEND ＡＣＭＥ for teams.";
  const sourceText = "ＡＣＭＥ";
  const source = mention(answer, sourceText);
  const result = detectRecommendationForMention(answer, source);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "recommended");
  assert.deepEqual(result.evidence, {
    startUtf16: 3,
    endUtf16: source.source.endUtf16,
    text: "I RECOMMEND ＡＣＭＥ",
  });
});

test("does not let distant language classify a mention outside the bounded context", () => {
  const answer = `I recommend ${"x".repeat(300)} Acme`;
  const result = detectRecommendationForMention(answer, mention(answer));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "unknown");
});

test("fails closed on malformed or ambiguous mention evidence", () => {
  const answer = "I recommend Acme.";
  const valid = mention(answer);

  assert.deepEqual(
    detectRecommendationForMention(answer, {
      ...valid,
      source: { ...valid.source, text: "Fake" },
    }),
    { ok: false, code: "invalid_mention" },
  );

  assert.deepEqual(
    detectRecommendationForMention(answer, {
      occurrenceOrdinal: 0,
      state: "ambiguous",
      normalizedAlias: "acme",
      candidates: [],
      source: valid.source,
    }),
    { ok: false, code: "invalid_mention" },
  );
});

test("bounds answer size rather than truncating classification context", () => {
  assert.deepEqual(
    detectRecommendationForMention("x".repeat(200_001), {}),
    { ok: false, code: "invalid_answer_text" },
  );
});
