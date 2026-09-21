export type ServiceHealthState =
  "healthy" | "degraded" | "unconfigured" | "failing";

export type SystemHealthStatus = "operational" | "degraded" | "failing";

export type ServiceSignal = Readonly<{
  name: string;
  state: ServiceHealthState;
  critical: boolean;
  message?: string;
}>;

export type WorkerQueueMetrics = Readonly<{
  activeLeases: number;
  queuedScans: number;
  completedToday: number;
  failedRetries: number;
}>;

export type TenantMetrics = Readonly<{
  totalWorkspaces: number;
  planBreakdown: Readonly<{
    free_tier: number;
    agency_starter: number;
    agency_pro: number;
  }>;
  activeScansThisMonth: number;
}>;

export type AdminTelemetryReport = Readonly<{
  status: SystemHealthStatus;
  timestamp: string;
  uptimeSeconds: number;
  services: ReadonlyArray<ServiceSignal>;
  queue: WorkerQueueMetrics;
  tenants: TenantMetrics;
}>;

/**
 * Deterministically evaluate overall system health from service signals.
 * Critical failing services cause "failing". Degraded or unconfigured cause "degraded".
 */
export function evaluateSystemHealthStatus(
  services: ReadonlyArray<ServiceSignal>,
): SystemHealthStatus {
  if (services.length === 0) {
    return "operational";
  }

  const hasCriticalFailure = services.some(
    (s) => s.critical && s.state === "failing",
  );
  if (hasCriticalFailure) {
    return "failing";
  }

  const hasDegraded = services.some(
    (s) => s.state === "degraded" || s.state === "unconfigured",
  );
  if (hasDegraded) {
    return "degraded";
  }

  return "operational";
}

export type BuildAdminTelemetryInput = Readonly<{
  uptimeSeconds: number;
  services: ReadonlyArray<ServiceSignal>;
  queue: WorkerQueueMetrics;
  tenants: TenantMetrics;
  timestamp?: string;
}>;

/**
 * Construct an immutable, frozen AdminTelemetryReport.
 */
export function buildAdminTelemetryReport(
  input: BuildAdminTelemetryInput,
): AdminTelemetryReport {
  const status = evaluateSystemHealthStatus(input.services);
  const timestamp = input.timestamp ?? new Date().toISOString();

  const report: AdminTelemetryReport = {
    status,
    timestamp,
    uptimeSeconds: Math.max(0, Math.floor(input.uptimeSeconds)),
    services: Object.freeze(
      input.services.map((s) =>
        Object.freeze({
          name: s.name,
          state: s.state,
          critical: s.critical,
          ...(s.message ? { message: s.message } : {}),
        }),
      ),
    ),
    queue: Object.freeze({
      activeLeases: Math.max(0, Math.floor(input.queue.activeLeases)),
      queuedScans: Math.max(0, Math.floor(input.queue.queuedScans)),
      completedToday: Math.max(0, Math.floor(input.queue.completedToday)),
      failedRetries: Math.max(0, Math.floor(input.queue.failedRetries)),
    }),
    tenants: Object.freeze({
      totalWorkspaces: Math.max(0, Math.floor(input.tenants.totalWorkspaces)),
      planBreakdown: Object.freeze({
        free_tier: Math.max(
          0,
          Math.floor(input.tenants.planBreakdown.free_tier),
        ),
        agency_starter: Math.max(
          0,
          Math.floor(input.tenants.planBreakdown.agency_starter),
        ),
        agency_pro: Math.max(
          0,
          Math.floor(input.tenants.planBreakdown.agency_pro),
        ),
      }),
      activeScansThisMonth: Math.max(
        0,
        Math.floor(input.tenants.activeScansThisMonth),
      ),
    }),
  };

  return Object.freeze(report);
}
