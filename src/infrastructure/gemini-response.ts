import "server-only";
import type { Citation, RawObservation } from "../domain/raw-observation.ts";

type Normalized = Pick<
  RawObservation,
  | "modelVersion"
  | "providerResponseId"
  | "outcome"
  | "failureCode"
  | "answerText"
  | "finishReason"
  | "groundingMetadata"
  | "citations"
>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === "string" && value.length > 0 && value.length <= 512)
  );
}

function citationUrl(
  value: string,
): Pick<Citation, "urlStatus" | "sourceDomain" | "exclusionReason"> {
  const excluded = {
    urlStatus: "excluded",
    sourceDomain: null,
    exclusionReason: "unsafe_url",
  } as const;
  if (
    value !== value.trim() ||
    /[\\<>\p{Cc}\p{Cf}]/u.test(value) ||
    !/^https?:\/\//i.test(value)
  )
    return excluded;
  try {
    const url = new URL(value);
    const authority = value.split("/")[2];
    if (
      !url.hostname ||
      url.username ||
      url.password ||
      authority?.includes("@")
    )
      return excluded;
    return {
      urlStatus: "eligible",
      sourceDomain: url.hostname,
      exclusionReason: null,
    };
  } catch {
    return excluded;
  }
}

/** Bounded body parsing happens upstream. This reads structured metadata only. */
export function normalizeGeminiResponse(
  input: unknown,
  observationId: string,
  observedAt: string,
): Normalized {
  const failed: Normalized = {
    modelVersion: null,
    providerResponseId: null,
    outcome: "failed",
    failureCode: "invalid_response",
    answerText: null,
    finishReason: null,
    groundingMetadata: null,
    citations: [],
  };
  if (
    !record(input) ||
    !optionalText(input.modelVersion) ||
    !optionalText(input.responseId)
  )
    return failed;
  const base = {
    ...failed,
    modelVersion: input.modelVersion ?? null,
    providerResponseId: input.responseId ?? null,
  };
  const feedback = input.promptFeedback;
  if (feedback !== undefined && !record(feedback)) return base;
  if (record(feedback) && feedback.blockReason !== undefined) {
    if (typeof feedback.blockReason !== "string") return base;
    if (
      [
        "SAFETY",
        "OTHER",
        "BLOCKLIST",
        "PROHIBITED_CONTENT",
        "IMAGE_SAFETY",
      ].includes(feedback.blockReason) &&
      (input.candidates === undefined ||
        (Array.isArray(input.candidates) && input.candidates.length === 0))
    ) {
      return { ...base, outcome: "refused", failureCode: null };
    }
    if (feedback.blockReason !== "BLOCK_REASON_UNSPECIFIED") return base;
  }
  if (!Array.isArray(input.candidates) || input.candidates.length !== 1)
    return base;
  const candidate: unknown = input.candidates[0];
  if (!record(candidate) || !optionalText(candidate.finishReason)) return base;
  const metadata = candidate.groundingMetadata;
  if (metadata !== undefined && !record(metadata)) return base;
  const captured = {
    ...base,
    finishReason: candidate.finishReason ?? null,
    groundingMetadata: metadata ?? null,
  };
  const chunks = metadata?.groundingChunks;
  if (chunks !== undefined && (!Array.isArray(chunks) || chunks.length > 50))
    return captured;
  const citations: Citation[] = [];
  if (Array.isArray(chunks))
    for (const [index, chunk] of chunks.entries()) {
      if (!record(chunk)) return captured;
      if (chunk.web === undefined) continue;
      if (
        !record(chunk.web) ||
        typeof chunk.web.uri !== "string" ||
        chunk.web.uri.length > 8192 ||
        !optionalText(chunk.web.title)
      )
        return captured;
      const url = citationUrl(chunk.web.uri);
      const common = {
        citationId: `${observationId}:grounding:${index}`,
        observationId,
        citedUrl: chunk.web.uri,
        sourceTitle: chunk.web.title ?? null,
        capturedAt: observedAt,
        relationship: "source_list_only",
        verification: "not_checked",
        groundingChunkIndex: index,
      } as const;
      // Explicit union branches retain the relation between eligibility and domain.
      citations.push(
        url.urlStatus === "eligible" && url.sourceDomain !== null
          ? {
              ...common,
              urlStatus: "eligible",
              sourceDomain: url.sourceDomain,
              exclusionReason: null,
            }
          : {
              ...common,
              urlStatus: "excluded",
              sourceDomain: null,
              exclusionReason: "unsafe_url",
            },
      );
    }
  let answerText: string | null = null;
  if (candidate.content !== undefined) {
    if (
      !record(candidate.content) ||
      !Array.isArray(candidate.content.parts) ||
      candidate.content.parts.length > 64
    )
      return captured;
    let answer = "";
    for (const part of candidate.content.parts) {
      if (
        !record(part) ||
        typeof part.text !== "string" ||
        (part.thought !== undefined && typeof part.thought !== "boolean")
      )
        return captured;
      if (part.thought !== true) answer += part.text;
    }
    answerText = answer || null;
  }
  const finish = candidate.finishReason;
  if (
    [
      "SAFETY",
      "RECITATION",
      "BLOCKLIST",
      "PROHIBITED_CONTENT",
      "SPII",
      "IMAGE_SAFETY",
    ].includes(String(finish))
  )
    return {
      ...captured,
      outcome: "refused",
      failureCode: null,
      answerText,
      citations,
    };
  if (
    finish === "MAX_TOKENS" ||
    ((finish === undefined || finish === "FINISH_REASON_UNSPECIFIED") &&
      answerText !== null)
  )
    return {
      ...captured,
      outcome: "partial",
      failureCode: null,
      answerText,
      citations,
    };
  if (finish === "STOP" && answerText !== null)
    return {
      ...captured,
      outcome: "answered",
      failureCode: null,
      answerText,
      citations,
    };
  return { ...captured, failureCode: "provider_error", answerText, citations };
}
