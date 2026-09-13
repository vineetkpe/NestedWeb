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

const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com";
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const MAX_CONFIGURED_OUTPUT_TOKENS = 65536;

/** Trusted server-only seam. Requests are constructed internally; callers never
 * provide a destination URL, headers, body shape, redirect policy, or method. */
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
      code:
        | "missing_credential"
        | "invalid_credential"
        | "invalid_model"
        | "invalid_max_output_tokens";
    };

type CommonOptions = Readonly<{
  model: string;
  env?: Readonly<Record<string, unknown>>;
  maxOutputTokens?: number;
  /** Trusted execution clock, never profile/provider/client metadata. */
  now?: () => string;
}>;

type FixtureOptions = CommonOptions &
  Readonly<{
    exchange?: GeminiExchange;
  }>;

async function nativeGeminiExchange(
  request: Parameters<GeminiExchange>[0],
): Promise<Response> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new Error("Invalid Gemini destination");
  }
  if (
    url.origin !== GEMINI_ORIGIN ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !/^\/v1beta\/models\/gemini-[a-z0-9.-]{1,80}:generateContent$/.test(
      url.pathname,
    ) ||
    request.init.method !== "POST" ||
    request.init.redirect !== "error" ||
    request.init.cache !== "no-store"
  )
    throw new Error("Invalid Gemini destination");

  return fetch(request.url, {
    method: "POST",
    headers: request.init.headers,
    body: request.init.body,
    signal: request.init.signal,
    redirect: "error",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
}

function buildGeminiProvider(
  options: CommonOptions,
  exchange: GeminiExchange | undefined,
  liveExecution: boolean,
): Setup {
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
  const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  if (
    !Number.isSafeInteger(maxOutputTokens) ||
    maxOutputTokens < 1 ||
    maxOutputTokens > MAX_CONFIGURED_OUTPUT_TOKENS
  )
    return { ok: false, code: "invalid_max_output_tokens" };

  const now = options.now ?? (() => new Date().toISOString());
  let busy = false;
  return {
    ok: true,
    provider: Object.freeze({
      capabilities: Object.freeze({
        provider: "gemini",
        surface: "api",
        grounding: "google_search",
        liveExecution,
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
              // The durable capture mode records use of the reviewed exchange
              // seam. capabilities.liveExecution distinguishes the native path.
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
            url: `${GEMINI_ORIGIN}/v1beta/models/${model}:generateContent`,
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
                generationConfig: { candidateCount: 1, maxOutputTokens },
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

/**
 * Closed-by-default fixture/provider boundary. Passing an exchange is explicit
 * test or trusted integration injection; omitting it can never use the network.
 */
export function createGeminiProvider(options: FixtureOptions): Setup {
  return buildGeminiProvider(options, options.exchange, false);
}

/**
 * Explicit live server-only provider. The destination, method, redirect policy,
 * grounding tool, body shape and credential header are fixed internally.
 */
export function createLiveGeminiProvider(options: CommonOptions): Setup {
  return buildGeminiProvider(options, nativeGeminiExchange, true);
}
