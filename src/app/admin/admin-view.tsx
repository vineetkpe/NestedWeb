"use client";

import Link from "next/link";
import { useState } from "react";

import type { AdminTelemetryReport } from "../../domain/admin-telemetry.ts";

interface AdminViewProps {
  report: AdminTelemetryReport;
}

export function AdminView({ report }: AdminViewProps) {
  const [activeTab, setActiveTab] = useState<"services" | "queue" | "tenants">(
    "services",
  );

  const statusBadge = (state: string) => {
    switch (state) {
      case "healthy":
      case "operational":
        return (
          <span className="inline-flex items-center gap-1 rounded-xs bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
            ● {state.toUpperCase()}
          </span>
        );
      case "degraded":
      case "unconfigured":
        return (
          <span className="inline-flex items-center gap-1 rounded-xs bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
            ▲ {state.toUpperCase()}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-xs bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
            ✕ {state.toUpperCase()}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Overview Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-border bg-card p-4 shadow-2xs">
          <span className="text-xs font-medium text-muted-foreground">
            System Status
          </span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xl font-bold capitalize text-foreground">
              {report.status}
            </span>
            {statusBadge(report.status)}
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-4 shadow-2xs">
          <span className="text-xs font-medium text-muted-foreground">
            System Uptime
          </span>
          <div className="mt-2 text-xl font-bold text-foreground">
            {Math.floor(report.uptimeSeconds / 60)}m {report.uptimeSeconds % 60}
            s
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-4 shadow-2xs">
          <span className="text-xs font-medium text-muted-foreground">
            Active Worker Leases
          </span>
          <div className="mt-2 text-xl font-bold text-foreground">
            {report.queue.activeLeases} / 5 Max
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-4 shadow-2xs">
          <span className="text-xs font-medium text-muted-foreground">
            Total Tenant Workspaces
          </span>
          <div className="mt-2 text-xl font-bold text-foreground">
            {report.tenants.totalWorkspaces}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("services")}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "services"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Service Telemetry ({report.services.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("queue")}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "queue"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Scan Queue & Leases
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tenants")}
          className={`border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "tenants"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Tenant Plan Distribution
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "services" && (
        <div className="rounded-md border border-border bg-card">
          <div className="border-b border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              Core Backend Services & Drivers
            </h3>
            <p className="text-xs text-muted-foreground">
              Evaluated server-side. Zero API keys or tokens are stored in the
              client payload.
            </p>
          </div>
          <div className="divide-y divide-border">
            {report.services.map((service, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {service.name}
                    </span>
                    {service.critical && (
                      <span className="rounded-xs bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        CRITICAL
                      </span>
                    )}
                  </div>
                  {service.message && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {service.message}
                    </p>
                  )}
                </div>
                <div>{statusBadge(service.state)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "queue" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">
              Scan Workers & Queue Health
            </h3>
            <p className="text-xs text-muted-foreground">
              All scans are managed with atomic Supabase lease claims and
              worst-case cost reservation gates.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <div className="rounded-sm border border-border bg-background p-3 text-center">
                <span className="text-xs text-muted-foreground">
                  Active Leases
                </span>
                <p className="text-2xl font-bold text-foreground">
                  {report.queue.activeLeases}
                </p>
              </div>
              <div className="rounded-sm border border-border bg-background p-3 text-center">
                <span className="text-xs text-muted-foreground">
                  Queued Scans
                </span>
                <p className="text-2xl font-bold text-foreground">
                  {report.queue.queuedScans}
                </p>
              </div>
              <div className="rounded-sm border border-border bg-background p-3 text-center">
                <span className="text-xs text-muted-foreground">
                  Completed Today
                </span>
                <p className="text-2xl font-bold text-foreground">
                  {report.queue.completedToday}
                </p>
              </div>
              <div className="rounded-sm border border-border bg-background p-3 text-center">
                <span className="text-xs text-muted-foreground">
                  Failed Retries
                </span>
                <p className="text-2xl font-bold text-foreground">
                  {report.queue.failedRetries}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "tenants" && (
        <div className="rounded-md border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">
            Tenant Workspaces by Subscription Tier
          </h3>
          <p className="text-xs text-muted-foreground">
            Server-enforced quotas based on Level 5 plan entitlements.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-sm border border-border bg-background p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Free Pilot
              </span>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {report.tenants.planBreakdown.free_tier}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                1 project, 5 scans/mo, 5 queries/scan
              </p>
            </div>
            <div className="rounded-sm border border-border bg-background p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Agency Starter
              </span>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {report.tenants.planBreakdown.agency_starter}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                5 projects, 50 scans/mo, 10 queries/scan
              </p>
            </div>
            <div className="rounded-sm border border-border bg-background p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-accent-foreground">
                Agency Pro
              </span>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {report.tenants.planBreakdown.agency_pro}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                25 projects, 250 scans/mo, 10 queries/scan
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        <span>Timestamp: {report.timestamp}</span>
        <Link
          href="/api/health"
          target="_blank"
          className="font-medium text-foreground underline hover:no-underline"
        >
          View Raw JSON Health Output →
        </Link>
      </div>
    </div>
  );
}
