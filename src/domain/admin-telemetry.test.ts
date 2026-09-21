import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSystemHealthStatus,
  buildAdminTelemetryReport,
  type ServiceSignal,
} from "./admin-telemetry.ts";

test("evaluates operational status when all critical services are healthy", () => {
  const services: ServiceSignal[] = [
    { name: "supabase_db", state: "healthy", critical: true },
    { name: "gemini_ai", state: "healthy", critical: true },
    { name: "crawler", state: "healthy", critical: false },
  ];

  assert.equal(evaluateSystemHealthStatus(services), "operational");
});

test("evaluates failing status when a critical service fails", () => {
  const services: ServiceSignal[] = [
    { name: "supabase_db", state: "failing", critical: true },
    { name: "gemini_ai", state: "healthy", critical: true },
  ];

  assert.equal(evaluateSystemHealthStatus(services), "failing");
});

test("evaluates degraded status when a non-critical service is unconfigured or degraded", () => {
  const services: ServiceSignal[] = [
    { name: "supabase_db", state: "healthy", critical: true },
    { name: "gemini_ai", state: "healthy", critical: true },
    { name: "crawler", state: "unconfigured", critical: false },
  ];

  assert.equal(evaluateSystemHealthStatus(services), "degraded");
});

test("builds completely frozen, immutable admin telemetry report", () => {
  const report = buildAdminTelemetryReport({
    uptimeSeconds: 3600.5,
    timestamp: "2026-09-21T17:00:00.000Z",
    services: [
      { name: "supabase_db", state: "healthy", critical: true },
      { name: "gemini_ai", state: "healthy", critical: true },
    ],
    queue: {
      activeLeases: 2,
      queuedScans: 5,
      completedToday: 42,
      failedRetries: 0,
    },
    tenants: {
      totalWorkspaces: 10,
      planBreakdown: {
        free_tier: 6,
        agency_starter: 3,
        agency_pro: 1,
      },
      activeScansThisMonth: 85,
    },
  });

  assert.equal(report.status, "operational");
  assert.equal(report.uptimeSeconds, 3600);
  assert.equal(report.queue.completedToday, 42);
  assert.equal(report.tenants.totalWorkspaces, 10);
  assert.equal(report.tenants.planBreakdown.agency_pro, 1);
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.services));
  assert.ok(Object.isFrozen(report.queue));
  assert.ok(Object.isFrozen(report.tenants));
  assert.ok(Object.isFrozen(report.tenants.planBreakdown));
});
