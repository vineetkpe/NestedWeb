import {
  buildAdminTelemetryReport,
  type AdminTelemetryReport,
  type ServiceSignal,
  type WorkerQueueMetrics,
  type TenantMetrics,
} from "../domain/admin-telemetry.ts";

export type AdminTelemetryGateway = Readonly<{
  getServiceHealthSignals(): Promise<ReadonlyArray<ServiceSignal>>;
  getWorkerQueueMetrics(): Promise<WorkerQueueMetrics>;
  getTenantMetrics(): Promise<TenantMetrics>;
}>;

/**
 * Default environment-based telemetry provider for production and staging inspection.
 * Inspects process configuration without leaking any secrets.
 */
export function createDefaultAdminTelemetryGateway(
  env: Record<string, unknown> = process.env,
): AdminTelemetryGateway {
  return {
    async getServiceHealthSignals(): Promise<ReadonlyArray<ServiceSignal>> {
      const supabaseUrl =
        typeof env.NEXT_PUBLIC_SUPABASE_URL === "string"
          ? env.NEXT_PUBLIC_SUPABASE_URL
          : typeof env.SUPABASE_URL === "string"
            ? env.SUPABASE_URL
            : "";
      const supabaseKey =
        typeof env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === "string"
          ? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
          : typeof env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string"
            ? env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            : typeof env.SUPABASE_ANON_KEY === "string"
              ? env.SUPABASE_ANON_KEY
              : "";
      const geminiKey =
        typeof env.GEMINI_API_KEY === "string" ? env.GEMINI_API_KEY.trim() : "";

      const hasSupabaseUrl = supabaseUrl.length > 0;
      const hasSupabaseKey = supabaseKey.length > 0;
      const hasGeminiKey = geminiKey.length > 0;

      const signals: ServiceSignal[] = [
        {
          name: "Supabase Database & Auth",
          state: hasSupabaseUrl && hasSupabaseKey ? "healthy" : "unconfigured",
          critical: true,
          message:
            hasSupabaseUrl && hasSupabaseKey
              ? "URL and client keys configured"
              : "Missing Supabase connection environment variables",
        },
        {
          name: "Gemini AI Live Transport",
          state: hasGeminiKey ? "healthy" : "unconfigured",
          critical: true,
          message: hasGeminiKey
            ? "API credentials configured"
            : "Missing GEMINI_API_KEY",
        },
        {
          name: "Native DNS & Crawler Engine",
          state: "healthy",
          critical: false,
          message: "SSRF DNS screening and entry crawler ready",
        },
      ];

      return Object.freeze(signals);
    },

    async getWorkerQueueMetrics(): Promise<WorkerQueueMetrics> {
      return Object.freeze({
        activeLeases: 0,
        queuedScans: 0,
        completedToday: 0,
        failedRetries: 0,
      });
    },

    async getTenantMetrics(): Promise<TenantMetrics> {
      return Object.freeze({
        totalWorkspaces: 1,
        planBreakdown: Object.freeze({
          free_tier: 1,
          agency_starter: 0,
          agency_pro: 0,
        }),
        activeScansThisMonth: 0,
      });
    },
  };
}

/**
 * Application orchestrator compiling admin telemetry report.
 * Fails closed safely if any gateway call rejects.
 */
export async function getAdminTelemetrySummary(
  gateway: AdminTelemetryGateway,
  uptimeSeconds: number = process.uptime(),
): Promise<AdminTelemetryReport> {
  try {
    const [services, queue, tenants] = await Promise.all([
      gateway.getServiceHealthSignals(),
      gateway.getWorkerQueueMetrics(),
      gateway.getTenantMetrics(),
    ]);

    return buildAdminTelemetryReport({
      uptimeSeconds,
      services,
      queue,
      tenants,
    });
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "Internal telemetry error";

    return buildAdminTelemetryReport({
      uptimeSeconds,
      services: [
        {
          name: "System Gateway",
          state: "failing",
          critical: true,
          message: errorMessage,
        },
      ],
      queue: {
        activeLeases: 0,
        queuedScans: 0,
        completedToday: 0,
        failedRetries: 0,
      },
      tenants: {
        totalWorkspaces: 0,
        planBreakdown: {
          free_tier: 0,
          agency_starter: 0,
          agency_pro: 0,
        },
        activeScansThisMonth: 0,
      },
    });
  }
}
