import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { ClaimScanExecutionResult } from "../../application/claim-scan-execution.ts";
import { createLiveGeminiProvider } from "../gemini.ts";
import {
  executeSupabaseScanWorkerOnce,
  type SupabaseScanWorkerRpc,
} from "../supabase-scan-runner.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_KEY_PATTERN = /^sb_secret_[A-Za-z0-9._-]{10,500}$/;
const GEMINI_KEY_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const DEFAULT_LEASE_SECONDS = 60;

export type ScanWorkerServerSetupFailureCode =
  | "live_execution_disabled"
  | "missing_supabase_url"
  | "invalid_supabase_url"
  | "missing_supabase_secret_key"
  | "invalid_supabase_secret_key"
  | "missing_gemini_credential"
  | "invalid_gemini_credential"
  | "missing_worker_id"
  | "invalid_worker_id"
  | "invalid_lease_seconds";

export type RunConfiguredScanWorkerResult =
  | ClaimScanExecutionResult
  | Readonly<{
      ok: false;
      stage: "server_setup";
      code: ScanWorkerServerSetupFailureCode;
    }>;

type WorkerEnvironment = Readonly<Record<string, unknown>>;

type WorkerConfig = Readonly<{
  supabaseUrl: string;
  supabaseSecretKey: string;
  geminiApiKey: string;
  workerId: string;
  leaseSeconds: number;
}>;

function setupFailure(
  code: ScanWorkerServerSetupFailureCode,
): RunConfiguredScanWorkerResult {
  return { ok: false, stage: "server_setup", code };
}

function parseSupabaseUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length > 300
  )
    return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const localHost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    return null;
  return url.origin;
}

function parseLeaseSeconds(value: unknown): number | null {
  if (value === undefined || value === "") return DEFAULT_LEASE_SECONDS;
  if (typeof value !== "string" || !/^[0-9]{2,3}$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 30 || parsed > 300) return null;
  return parsed;
}

function readWorkerConfig(
  env: WorkerEnvironment,
): WorkerConfig | RunConfiguredScanWorkerResult {
  if (env.NESTEDWEB_LIVE_SCAN_WORKER_ENABLED !== "true")
    return setupFailure("live_execution_disabled");

  if (env.SUPABASE_URL === undefined || env.SUPABASE_URL === "")
    return setupFailure("missing_supabase_url");
  const supabaseUrl = parseSupabaseUrl(env.SUPABASE_URL);
  if (supabaseUrl === null) return setupFailure("invalid_supabase_url");

  if (env.SUPABASE_SECRET_KEY === undefined || env.SUPABASE_SECRET_KEY === "")
    return setupFailure("missing_supabase_secret_key");
  if (
    typeof env.SUPABASE_SECRET_KEY !== "string" ||
    !SECRET_KEY_PATTERN.test(env.SUPABASE_SECRET_KEY)
  )
    return setupFailure("invalid_supabase_secret_key");

  if (env.GEMINI_API_KEY === undefined || env.GEMINI_API_KEY === "")
    return setupFailure("missing_gemini_credential");
  if (
    typeof env.GEMINI_API_KEY !== "string" ||
    !GEMINI_KEY_PATTERN.test(env.GEMINI_API_KEY)
  )
    return setupFailure("invalid_gemini_credential");

  if (
    env.NESTEDWEB_SCAN_WORKER_ID === undefined ||
    env.NESTEDWEB_SCAN_WORKER_ID === ""
  )
    return setupFailure("missing_worker_id");
  if (
    typeof env.NESTEDWEB_SCAN_WORKER_ID !== "string" ||
    env.NESTEDWEB_SCAN_WORKER_ID !== env.NESTEDWEB_SCAN_WORKER_ID.trim() ||
    !UUID_PATTERN.test(env.NESTEDWEB_SCAN_WORKER_ID)
  )
    return setupFailure("invalid_worker_id");

  const leaseSeconds = parseLeaseSeconds(env.NESTEDWEB_SCAN_LEASE_SECONDS);
  if (leaseSeconds === null) return setupFailure("invalid_lease_seconds");

  return Object.freeze({
    supabaseUrl,
    supabaseSecretKey: env.SUPABASE_SECRET_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    workerId: env.NESTEDWEB_SCAN_WORKER_ID.toLowerCase(),
    leaseSeconds,
  });
}

function isSetupFailure(
  value: WorkerConfig | RunConfiguredScanWorkerResult,
): value is Extract<RunConfiguredScanWorkerResult, { stage: "server_setup" }> {
  return "stage" in value;
}

/**
 * Executes at most one claimed scan. This is deliberately not an HTTP route or
 * scheduled entry point. A deployment must explicitly enable the worker and
 * provide server-only Supabase/Gemini credentials before this function can
 * claim work or make a provider request.
 */
export async function runConfiguredScanWorkerOnce(
  options: Readonly<{
    env?: WorkerEnvironment;
    signal?: AbortSignal;
  }> = {},
): Promise<RunConfiguredScanWorkerResult> {
  const env = options.env ?? process.env;
  const config = readWorkerConfig(env);
  if (isSetupFailure(config)) return config;

  const client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const rpc: SupabaseScanWorkerRpc = async (name, args) =>
    await client.rpc(name, args);

  return executeSupabaseScanWorkerOnce(
    { workerId: config.workerId, leaseSeconds: config.leaseSeconds },
    rpc,
    (providerConfig) => {
      const setup = createLiveGeminiProvider({
        model: providerConfig.modelId,
        maxOutputTokens: providerConfig.maxOutputTokens,
        env: { GEMINI_API_KEY: config.geminiApiKey },
      });
      if (!setup.ok || !setup.provider.capabilities.liveExecution) return null;
      return setup.provider;
    },
    options.signal,
  );
}
