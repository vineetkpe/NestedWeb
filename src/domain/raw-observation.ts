export type ObservationFailureCode =
  | "live_provider_unavailable"
  | "busy"
  | "cancelled"
  | "timeout"
  | "network_error"
  | "unauthorized"
  | "rate_limited"
  | "provider_error"
  | "invalid_response"
  | "response_too_large"
  | "credential_echo";

export type Citation = Readonly<{
  citationId: string;
  observationId: string;
  citedUrl: string;
  sourceTitle: string | null;
  capturedAt: string;
  relationship: "source_list_only";
  verification: "not_checked";
  /** Index in rawResponse.candidates[0].groundingMetadata.groundingChunks. */
  groundingChunkIndex: number;
}> &
  (
    | Readonly<{
        urlStatus: "eligible";
        sourceDomain: string;
        exclusionReason: null;
      }>
    | Readonly<{
        urlStatus: "excluded";
        sourceDomain: null;
        exclusionReason: "unsafe_url";
      }>
  );

/** Untrusted capture data, never an instruction, HTML fragment, or safe log DTO. */
export type RawObservation = Readonly<{
  observationId: string;
  queryId: string;
  queryVersion: string;
  queryText: string;
  provider: "gemini";
  surface: "api";
  captureVersion: "gemini-generate-content-v1";
  captureMode: "injected_transport" | "not_executed";
  requestedModel: string;
  modelVersion: string | null;
  providerResponseId: string | null;
  observedAt: string;
  /** Complete decoded UTF-8 HTTP body, including provider JSON and whitespace. */
  rawResponse: string | null;
  responseDigest: string | null;
  rawResponseState: "complete" | "not_received" | "discarded";
  outcome: "answered" | "refused" | "partial" | "failed";
  failureCode: ObservationFailureCode | null;
  answerText: string | null;
  finishReason: string | null;
  /** Provider metadata only. Preserve unknown fields as inert data. */
  groundingMetadata: Readonly<Record<string, unknown>> | null;
  citations: readonly Citation[];
}>;
