import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultAdminTelemetryGateway,
  getAdminTelemetrySummary,
  type AdminTelemetryGateway,
} from "./admin-telemetry.ts";

test("default gateway reports configured services based on environment without leaking secrets", async () => {
  const fakeEnv: Record<string, unknown> = {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "secret-anon-key-12345",
    GEMINI_API_KEY: "gemini-secret-api-key-xyz",
  };

  const gateway = createDefaultAdminTelemetryGateway(fakeEnv);
  const report = await getAdminTelemetrySummary(gateway, 120);

  assert.equal(report.status, "operational");
  assert.equal(report.uptimeSeconds, 120);
  assert.equal(report.services.length, 3);
  assert.ok(report.services.every((s) => s.state === "healthy"));

  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes("secret-anon-key-12345"));
  assert.ok(!serialized.includes("gemini-secret-api-key-xyz"));
});

test("default gateway detects missing credentials as unconfigured", async () => {
  const emptyEnv: Record<string, unknown> = {};
  const gateway = createDefaultAdminTelemetryGateway(emptyEnv);
  const report = await getAdminTelemetrySummary(gateway, 45);

  assert.equal(report.status, "degraded");
  const supabaseService = report.services.find((s) =>
    s.name.includes("Supabase"),
  );
  assert.equal(supabaseService?.state, "unconfigured");
});

test("fails closed safely when gateway throws an error", async () => {
  const failingGateway: AdminTelemetryGateway = {
    async getServiceHealthSignals() {
      throw new Error("Simulated connection timeout");
    },
    async getWorkerQueueMetrics() {
      return {
        activeLeases: 0,
        queuedScans: 0,
        completedToday: 0,
        failedRetries: 0,
      };
    },
    async getTenantMetrics() {
      return {
        totalWorkspaces: 0,
        planBreakdown: { free_tier: 0, agency_starter: 0, agency_pro: 0 },
        activeScansThisMonth: 0,
      };
    },
  };

  const report = await getAdminTelemetrySummary(failingGateway, 30);
  assert.equal(report.status, "failing");
  assert.ok(
    report.services.some((s) =>
      s.message?.includes("Simulated connection timeout"),
    ),
  );
});
