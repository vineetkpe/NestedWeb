import type { ScanAttempt, ScanRequest, ScanResult } from "../domain/scan.ts";
import {
  isScanProvider,
  snapshotScan,
  snapshotScanResponse,
} from "./scan-validation.ts";
import type {
  GroundedAIProvider,
  GroundedQueryResponse,
} from "./grounded-ai-provider.ts";

export type ScanRunner = (
  input: unknown,
  provider: unknown,
  signal?: AbortSignal,
) => Promise<ScanResult>;

/** In-process collection only. Provider injection is trusted infrastructure,
 * not authorization; live execution remains closed by the provider contract. */
export const runScan: ScanRunner = async (input, provider, signal) => {
  let request: ScanRequest | null;
  let query: GroundedAIProvider["query"];
  let capabilities: GroundedAIProvider["capabilities"];
  try {
    if (!isScanProvider(provider))
      return { ok: false, failure: { code: "invalid_provider" } };
    query = provider.query.bind(provider);
    capabilities = { ...provider.capabilities };
  } catch {
    return { ok: false, failure: { code: "invalid_provider" } };
  }
  try {
    request = snapshotScan(input);
  } catch {
    request = null;
  }
  if (!request) return { ok: false, failure: { code: "invalid_scan" } };
  const attempts: ScanAttempt[] = [];
  for (const [position, plannedPrompt] of request.cohort.prompts.entries()) {
    const attemptId = `s${request.scanId.length}_${request.scanId}_a${request.attemptId.length}_${request.attemptId}_q${position + 1}`;
    const base = { position, attemptId, plannedPrompt };
    if (signal?.aborted) {
      attempts.push({
        ...base,
        state: "not_attempted",
        providerCalled: false,
        observation: null,
        failure: { code: "cancelled" },
      });
      continue;
    }
    const execution = {
      observationId: attemptId,
      queryId: plannedPrompt.queryId,
      queryVersion: plannedPrompt.templateVersion,
      queryText: plannedPrompt.text,
    };
    let raw: unknown;
    try {
      raw = await query({ ...execution }, signal);
    } catch {
      attempts.push({
        ...base,
        state: signal?.aborted ? "cancelled" : "failed",
        providerCalled: true,
        observation: null,
        failure: { code: "provider_exception" },
      });
      continue;
    }
    let response: GroundedQueryResponse | null;
    try {
      response = snapshotScanResponse(raw, execution, capabilities);
    } catch {
      response = null;
    }
    if (!response || !response.ok) {
      attempts.push({
        ...base,
        state: "failed",
        providerCalled: true,
        observation: null,
        failure: { code: response?.code ?? "invalid_provider_response" },
      });
      continue;
    }
    const observation = response.observation;
    if (observation.captureMode === "not_executed") {
      attempts.push({
        ...base,
        state: "not_attempted",
        providerCalled: true,
        observation: null,
        failure: {
          code: observation.failureCode ?? "invalid_provider_response",
        },
      });
    } else if (observation.outcome === "failed") {
      attempts.push({
        ...base,
        state: observation.failureCode === "cancelled" ? "cancelled" : "failed",
        providerCalled: true,
        observation,
        failure: {
          code: observation.failureCode ?? "invalid_provider_response",
        },
      });
    } else {
      attempts.push({
        ...base,
        state: observation.outcome,
        providerCalled: true,
        observation,
        failure: null,
      });
    }
  }
  return {
    ok: true,
    ...request,
    state: signal?.aborted ? "cancelled" : "settled",
    attempts,
  };
};
