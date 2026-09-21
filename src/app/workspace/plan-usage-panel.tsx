"use client";

import { useActionState, useState } from "react";
import type { UsageQuotaSummary } from "../../domain/plan-entitlements.ts";

export type QuotaInspectionResult =
  | Readonly<{
      ok: true;
      message: string;
      summary: UsageQuotaSummary | null;
    }>
  | Readonly<{
      ok: false;
      message: string;
      summary: null;
    }>;

export type PlanUsagePanelProps = Readonly<{
  checkQuotaAction: (
    previousState: QuotaInspectionResult,
    formData: FormData,
  ) => Promise<QuotaInspectionResult>;
  disabled?: boolean;
}>;

const INITIAL_STATE: QuotaInspectionResult = {
  ok: true,
  message: "Enter an authorized workspace ID to inspect plan quotas.",
  summary: null,
};

export function PlanUsagePanel({
  checkQuotaAction,
  disabled = false,
}: PlanUsagePanelProps) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [state, formAction, isPending] = useActionState(
    checkQuotaAction,
    INITIAL_STATE,
  );

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="plan-workspace-id"
            className="text-sm font-medium text-foreground"
          >
            Workspace ID for quota check
          </label>
          <input
            id="plan-workspace-id"
            name="workspaceId"
            type="text"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            disabled={disabled}
            placeholder="00000000-0000-4000-8000-000000000000"
            className="min-h-11 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={disabled || isPending || workspaceId.trim().length === 0}
            className="inline-flex min-h-11 items-center rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Checking quota…" : "Check plan quota"}
          </button>
          <span className="text-sm text-muted-foreground">{state.message}</span>
        </div>
      </form>

      {state.summary ? (
        <div className="space-y-4 rounded-sm border border-border bg-accent/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current Plan
              </span>
              <h3 className="text-lg font-semibold text-foreground">
                {state.summary.planName}
              </h3>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Active Tier: {state.summary.tier}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-sm border border-border bg-card p-4">
              <span className="text-xs font-medium text-muted-foreground">
                Client Projects
              </span>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {state.summary.projects.used} / {state.summary.projects.max}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {state.summary.projects.exhausted
                  ? "Project limit reached. Upgrade to add more brands."
                  : `${state.summary.projects.remaining} project slot${state.summary.projects.remaining === 1 ? "" : "s"} available.`}
              </p>
            </div>

            <div className="rounded-sm border border-border bg-card p-4">
              <span className="text-xs font-medium text-muted-foreground">
                Monthly Scans
              </span>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {state.summary.scans.usedThisMonth} /{" "}
                {state.summary.scans.maxPerMonth}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {state.summary.scans.exhausted
                  ? "Monthly scan quota exhausted."
                  : `${state.summary.scans.remainingThisMonth} scan${state.summary.scans.remainingThisMonth === 1 ? "" : "s"} remaining this cycle.`}
              </p>
            </div>

            <div className="rounded-sm border border-border bg-card p-4">
              <span className="text-xs font-medium text-muted-foreground">
                Concurrent Scans
              </span>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {state.summary.concurrency.active} /{" "}
                {state.summary.concurrency.max}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {state.summary.concurrency.available} slot
                {state.summary.concurrency.available === 1 ? "" : "s"} available
                for simultaneous scanning.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-sm border border-border/60 bg-muted/20 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Agency Plan Comparison
        </h4>
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-sm border border-border bg-card p-3">
            <strong className="font-semibold text-foreground">
              Free Pilot
            </strong>
            <p className="mt-1 text-muted-foreground">1 brand project</p>
            <p className="text-muted-foreground">
              5 scans/month (5 queries/scan)
            </p>
            <p className="text-muted-foreground">1 concurrent scan</p>
          </div>
          <div className="rounded-sm border border-border bg-card p-3">
            <strong className="font-semibold text-foreground">
              Agency Starter
            </strong>
            <p className="mt-1 text-muted-foreground">5 brand projects</p>
            <p className="text-muted-foreground">
              50 scans/month (10 queries/scan)
            </p>
            <p className="text-muted-foreground">2 concurrent scans</p>
          </div>
          <div className="rounded-sm border border-border bg-card p-3">
            <strong className="font-semibold text-foreground">
              Agency Pro
            </strong>
            <p className="mt-1 text-muted-foreground">25 brand projects</p>
            <p className="text-muted-foreground">
              250 scans/month (10 queries/scan)
            </p>
            <p className="text-muted-foreground">5 concurrent scans</p>
          </div>
        </div>
      </div>
    </div>
  );
}
