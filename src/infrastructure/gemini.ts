import "server-only";
import { createHash } from "node:crypto";
import {
  validateGroundedQuery,
  type GroundedAIProvider,
  type GroundedQueryResponse,
} from "../application/grounded-ai-provider.ts";
import type {
  ObservationFailureCode,
  RawObservation,
} from "../domain/raw-observation.ts";
import { normalizeGeminiResponse } from "./gemini-response.ts";
import {
  readProviderBody,
  discard,
  ResponseTooLarge,
} from "./provider-response-body.ts";

/** Trusted server-only seam. Never log this request or pass ordinary fetch here
 * before ADR-011's authorization, cost and deployment prerequisites are met. */
export type GeminiExchange = (
  request: Readonly<{
    url: string;
    init: Readonly<{
      method: "POST";
      headers: Readonly<Record<string, string>>;
      body: string;
      signal: AbortSignal;
      redirect: "error";
      cache: "no-store";
    }>;
  }>,
) => Promise<Response>;

type Setup =
  | { ok: true; provider: GroundedAIProvider }
  | {
      ok: false;
      code: "missing_credential" | "invalid_credential" | "invalid_model";
    };

export function createGeminiProvider(options: {
  model: string;
  env?: Readonly<Record<string, unknown>>;
  exchange?: GeminiExchange;
  /** Trusted execution clock, never profile/provider/client metadata. */
  now?: () => string;
}): Setup {
  const key = (options.env ?? process.env).GEMINI_API_KEY;
  if (key === undefined || key === "")
    return { ok: false, code: "missing_credential" };
  if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{16,256}$/.test(key))
    return { ok: false, code: "invalid_credential" };
  const model = options.model;
  if (
    typeof model !== "string" ||
    !/^gemini-[a-z0-9.-]{1,80}$/.test(model) ||
    model.includes(key)
  )
    return { ok: false, code: "invalid_model" };
  const exchange = options.exchange;
  const now = options.now ?? (() => new Date().toISOString());
  let busy = false;
  return {
    ok: true,
    provider: Object.freeze({
      capabilities: Object.freeze({
        provider: "gemini",
        surface: "api",
        grounding: "google_search",
        liveExecution: false,
        maxQueries: 1,
        maxCitations: 50,
      }),
      async query(
        input: unknown,
        signal?: AbortSignal,
      ): Promise<GroundedQueryResponse> {
        const request = validateGroundedQuery(input);
        if (
          !request ||
          Object.values(request).some((value) => value.includes(key))
        )
          return { ok: false, code: "invalid_request" };
        let rawResponse: string | null = null;
        let rawResponseState: RawObservation["rawResponseState"] =
          "not_received";
        let payload: unknown;
        let attempted = false;
        const finish = (
          failureCode: ObservationFailureCode | null,
        ): GroundedQueryResponse => {
          let observedAt: string;
          try {
            observedAt = now();
            if (
              typeof observedAt !== "string" ||
              observedAt.length !== 24 ||
              new Date(observedAt).toISOString() !== observedAt
            )
              return { ok: false, code: "invalid_clock" };
          } catch {
            return { ok: false, code: "invalid_clock" };
          }
          const normalized =
            failureCode === null
              ? normalizeGeminiResponse(
                  payload,
                  request.observationId,
                  observedAt,
                )
              : ({
                  outcome: "failed",
                  failureCode,
                  modelVersion: null,
                  providerResponseId: null,
                  answerText: null,
                  finishReason: null,
                  groundingMetadata: null,
                  citations: [],
                } as const);
          return {
            ok: true,
            observation: {
              ...request,
              provider: "gemini",
              surface: "api",
              captureVersion: "gemini-generate-content-v1",
              captureMode: attempted ? "injected_transport" : "not_executed",
              requestedModel: model,
              observedAt,
              rawResponse,
              rawResponseState,
              responseDigest:
                rawResponse === null
                  ? null
                  : `sha256:${createHash("sha256").update(rawResponse, "utf8").digest("hex")}`,
              ...normalized,
            },
          };
        };
        if (signal?.aborted) return finish("cancelled");
        if (!exchange) return finish("live_provider_unavailable");
        if (busy) return finish("busy");
        busy = true;
        const controller = new AbortController();
        let timedOut = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let abort = () => {};
        const interrupted = new Promise<never>((_resolve, reject) => {
          abort = () => {
            reject(new Error("Provider interrupted"));
            controller.abort();
          };
          signal?.addEventListener("abort", abort, { once: true });
          timer = setTimeout(() => {
            timedOut = true;
            abort();
          }, 20000);
        });
        const run = async (): Promise<ObservationFailureCode | null> => {
          attempted = true;
          const response = await exchange({
            url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            init: {
              method: "POST",
              redirect: "error",
              cache: "no-store",
              signal: controller.signal,
              headers: {
                "x-goog-api-key": key,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contents: [
                  { role: "user", parts: [{ text: request.queryText }] },
                ],
                tools: [{ google_search: {} }],
                generationConfig: { candidateCount: 1, maxOutputTokens: 4096 },
              }),
            },
          });
          if (controller.signal.aborted) {
            discard(response.body);
            controller.signal.throwIfAborted();
          }
          rawResponseState = "discarded";
          let body: string;
          try {
            body = await readProviderBody(response, controller.signal, true);
          } catch (error) {
            if (controller.signal.aborted) throw error;
            return error instanceof ResponseTooLarge
              ? "response_too_large"
              : "invalid_response";
          }
          // Check both raw text and JSON-decoded strings/keys for credential echoes.
          // Do not redact: a modified payload cannot be labelled exact evidence.
          if (body.includes(key)) return "credential_echo";
          try {
            payload = JSON.parse(body);
            if (JSON.stringify(payload).includes(key)) return "credential_echo";
          } catch (error) {
            if (!(error instanceof SyntaxError)) return "invalid_response";
            payload = undefined;
          }
          rawResponse = body;
          rawResponseState = "complete";
          if (response.status === 401 || response.status === 403)
            return "unauthorized";
          if (response.status === 429) return "rate_limited";
          if (!response.ok) return "provider_error";
          return null;
        };
        try {
          const failure = await Promise.race([run(), interrupted]);
          if (signal?.aborted) return finish("cancelled");
          if (timedOut) return finish("timeout");
          return finish(failure);
        } catch {
          return finish(
            signal?.aborted
              ? "cancelled"
              : timedOut
                ? "timeout"
                : "network_error",
          );
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          controller.abort();
          busy = false;
        }
      },
    }),
  };
}
