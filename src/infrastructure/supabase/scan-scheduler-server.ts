import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateAndEnqueueDueSchedules,
  type SchedulerDependencies,
  type SchedulerEvaluationResult,
} from "../../application/scan-scheduler.ts";
import {
  validateProjectScanSchedule,
  type ProjectScanSchedule,
} from "../../domain/scan-schedule.ts";

const SECRET_KEY_PATTERN =
  /^(?:sb_secret_[A-Za-z0-9._-]{10,500}|eyJ[A-Za-z0-9._-]{20,2000})$/;

export type SchedulerServerSetupFailureCode =
  | "missing_supabase_url"
  | "invalid_supabase_url"
  | "missing_supabase_secret_key"
  | "invalid_supabase_secret_key";

export type SchedulerServerSetupFailure = Readonly<{
  ok: false;
  stage: "server_setup";
  code: SchedulerServerSetupFailureCode;
}>;

export type SchedulerServerConfig = Readonly<{
  supabaseUrl: string;
  supabaseSecretKey: string;
}>;

export type RunConfiguredScanSchedulerResult =
  | (SchedulerEvaluationResult & Readonly<{ ok: true }>)
  | SchedulerServerSetupFailure;

type ServerEnvironment = Readonly<Record<string, unknown>>;

export function parseSchedulerServerConfig(
  env: ServerEnvironment,
): SchedulerServerConfig | SchedulerServerSetupFailure {
  const rawUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { ok: false, stage: "server_setup", code: "missing_supabase_url" };
  }

  let supabaseUrl: string;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, stage: "server_setup", code: "invalid_supabase_url" };
    }
    supabaseUrl = parsed.origin;
  } catch {
    return { ok: false, stage: "server_setup", code: "invalid_supabase_url" };
  }

  const rawKey = env.SUPABASE_SECRET_KEY;
  if (!rawKey || typeof rawKey !== "string" || rawKey.trim().length === 0) {
    return {
      ok: false,
      stage: "server_setup",
      code: "missing_supabase_secret_key",
    };
  }

  if (!SECRET_KEY_PATTERN.test(rawKey.trim())) {
    return {
      ok: false,
      stage: "server_setup",
      code: "invalid_supabase_secret_key",
    };
  }

  return Object.freeze({
    supabaseUrl,
    supabaseSecretKey: rawKey.trim(),
  });
}

/**
 * Creates Supabase database dependencies for the scheduler.
 */
export function createSupabaseSchedulerDependencies(
  client: SupabaseClient,
): SchedulerDependencies {
  const deps: SchedulerDependencies = {
    checkScanQuota: async (workspaceId: string) => {
      // Inquire workspace scan controls
      const { data, error } = await client
        .from("workspace_scan_controls")
        .select("max_scans_per_month, current_month_scans")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error || !data) {
        // Default allow if controls not explicitly locked, or fail closed if required
        return { allowed: true };
      }

      if (
        typeof data.max_scans_per_month === "number" &&
        typeof data.current_month_scans === "number" &&
        data.current_month_scans >= data.max_scans_per_month
      ) {
        return {
          allowed: false,
          reason: "monthly_scan_quota_exhausted",
        };
      }

      return { allowed: true };
    },

    enqueueScan: async ({
      projectId,
      workspaceId,
    }: {
      projectId: string;
      workspaceId: string;
    }) => {
      // Check if project exists and has tracked domain
      const { data: project, error: projError } = await client
        .from("projects")
        .select("id, tracked_domain")
        .eq("id", projectId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (projError || !project) {
        return { ok: false, error: "project_not_found" };
      }

      // Enqueue scan record in public.scans
      const { data: scan, error: scanError } = await client
        .from("scans")
        .insert({
          workspace_id: workspaceId,
          project_id: projectId,
          state: "queued",
        })
        .select("id")
        .maybeSingle();

      if (scanError || !scan) {
        return {
          ok: false,
          error: scanError?.message ?? "failed_to_insert_scan",
        };
      }

      return { ok: true, scanId: scan.id };
    },

    updateScheduleTimestamps: async (
      projectId: string,
      update: Readonly<{ lastRunAt: string; nextRunAt: string | null }>,
    ) => {
      await client
        .from("project_scan_schedules")
        .update({
          last_run_at: update.lastRunAt,
          next_run_at: update.nextRunAt,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", projectId);
    },
  };

  return Object.freeze(deps);
}

/**
 * Executes a single scheduled monitor scan evaluation cycle.
 * Authenticated via service credentials.
 */
export async function runConfiguredScanSchedulerOnce(
  options: Readonly<{
    env?: ServerEnvironment;
    asOf?: Date | string;
  }> = {},
): Promise<RunConfiguredScanSchedulerResult> {
  const env = options.env ?? process.env;
  const config = parseSchedulerServerConfig(env);
  if ("stage" in config) {
    return config;
  }

  const client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const asOf = options.asOf
    ? typeof options.asOf === "string"
      ? new Date(options.asOf)
      : options.asOf
    : new Date();

  // Query due project scan schedules
  const { data, error } = await client
    .from("project_scan_schedules")
    .select(
      "project_id, workspace_id, cadence, is_active, last_run_at, next_run_at",
    )
    .eq("is_active", true)
    .lte("next_run_at", asOf.toISOString());

  if (error || !data) {
    return Object.freeze({
      ok: true,
      evaluatedCount: 0,
      dueCount: 0,
      enqueuedCount: 0,
      skippedQuotaCount: 0,
      failedCount: 0,
      enqueued: Object.freeze([]),
      skipped: Object.freeze([]),
      failed: Object.freeze([]),
      durationMs: 0,
    });
  }

  const validSchedules: ProjectScanSchedule[] = [];
  for (const item of data) {
    const validated = validateProjectScanSchedule({
      projectId: item.project_id,
      workspaceId: item.workspace_id,
      cadence: item.cadence,
      isActive: item.is_active,
      lastRunAt: item.last_run_at,
      nextRunAt: item.next_run_at,
    });
    if (validated) {
      validSchedules.push(validated);
    }
  }

  const deps = createSupabaseSchedulerDependencies(client);
  const evaluation = await evaluateAndEnqueueDueSchedules(
    validSchedules,
    deps,
    { asOf },
  );

  return Object.freeze({
    ok: true as const,
    ...evaluation,
  });
}
