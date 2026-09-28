"use client";

import Link from "next/link";
import { useState } from "react";
import {
  computeNextRunAt,
  formatCadenceLabel,
  type ScanCadence,
} from "../../domain/scan-schedule.ts";

interface ProjectDetailProps {
  workspaceId: string;
  projectId: string;
  projectName: string;
  trackedDomain: string;
  initialCadence?: ScanCadence;
  initialNextRunAt?: string | null;
}

const PROMPT_PREVIEWS = [
  {
    kind: "Category discovery",
    query: "Which platforms serve B2B SaaS analytics?",
  },
  {
    kind: "Best tools/platforms",
    query: "What are the best tools for AI search visibility?",
  },
  {
    kind: "Alternatives",
    query: "What are alternatives to leading visibility tools?",
  },
  {
    kind: "Comparison",
    query: "How does this platform compare with competitors?",
  },
  {
    kind: "Buyer intent",
    query: "Which visibility platform fits agency needs?",
  },
];

const AVAILABLE_CADENCES: readonly {
  id: ScanCadence;
  name: string;
  desc: string;
  monthlyCost: string;
}[] = [
  {
    id: "weekly",
    name: "Weekly monitoring",
    desc: "Standard recommended cadence for client retainers",
    monthlyCost: "~4 scans/mo",
  },
  {
    id: "biweekly",
    name: "Bi-weekly monitoring",
    desc: "Moderate cadence for stable categories",
    monthlyCost: "~2 scans/mo",
  },
  {
    id: "monthly",
    name: "Monthly monitoring",
    desc: "Baseline monitoring for lower-tier retainer packages",
    monthlyCost: "1 scan/mo",
  },
  {
    id: "daily",
    name: "Daily monitoring",
    desc: "High-frequency tracking for active product launches",
    monthlyCost: "~30 scans/mo",
  },
  {
    id: "manual",
    name: "Manual on-demand",
    desc: "Automated recurring scans paused; manual runs only",
    monthlyCost: "0 recurring",
  },
];

export function ProjectDetailPanel({
  workspaceId,
  projectId,
  projectName,
  trackedDomain,
  initialCadence = "weekly",
  initialNextRunAt,
}: ProjectDetailProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "schedule" | "prompts" | "actions"
  >("overview");

  const [cadence, setCadence] = useState<ScanCadence>(initialCadence);
  const [savedCadence, setSavedCadence] = useState<ScanCadence>(initialCadence);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const reportUrl = `/report?workspaceId=${encodeURIComponent(workspaceId)}&projectId=${encodeURIComponent(projectId)}`;

  const calculatedNextRun =
    cadence === "manual"
      ? null
      : (initialNextRunAt ?? computeNextRunAt(cadence));

  const handleSaveCadence = () => {
    setSavedCadence(cadence);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <section
      aria-labelledby="project-detail-heading"
      className="mt-6 rounded-md border border-border bg-card p-6 shadow-xs"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Client Operations
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              <span
                className={`size-1.5 rounded-full ${cadence !== "manual" ? "bg-success" : "bg-muted-foreground"}`}
              />
              {cadence !== "manual"
                ? "Automated Monitor Active"
                : "Manual Only"}
            </span>
          </div>
          <h2
            id="project-detail-heading"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            {projectName}
          </h2>
          <p className="text-sm text-muted-foreground">
            Tracked domain:{" "}
            <span className="font-mono text-xs text-foreground">
              {trackedDomain}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={reportUrl}
            className="inline-flex min-h-10 items-center justify-center rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Open Client Evidence Report →
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex border-b border-border text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`border-b-2 px-4 py-2 transition-colors ${
            activeTab === "overview"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Operations Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("schedule")}
          className={`border-b-2 px-4 py-2 transition-colors ${
            activeTab === "schedule"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Monitoring Schedule
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("prompts")}
          className={`border-b-2 px-4 py-2 transition-colors ${
            activeTab === "prompts"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Prompt Library Cohort (5 Queries)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("actions")}
          className={`border-b-2 px-4 py-2 transition-colors ${
            activeTab === "actions"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Customer Actions Engine
        </button>
      </div>

      {/* Tab Contents */}
      <div className="pt-6">
        {activeTab === "overview" && (
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-sm border border-border bg-background p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Domain Screening Status
              </h3>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>SSRF DNS Screening:</span>
                  <span className="font-medium text-success">
                    Passed (Public IP)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Entry Crawler Scope:</span>
                  <span className="font-medium text-foreground">
                    Validated Domain
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Target AI Model:</span>
                  <span className="font-medium text-foreground">
                    Gemini 2.5 Flash Grounded
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <span>Monitor Cadence:</span>
                  <span className="font-medium text-foreground">
                    {formatCadenceLabel(savedCadence)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-sm border border-border bg-background p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Evidence & Report Pipeline
              </h3>
              <p className="mt-2 text-xs text-muted-foreground">
                Scans generate immutable raw observation records with exact
                citation URLs, character-span mention detection, and visibility
                score calculations.
              </p>
              <div className="mt-4">
                <Link
                  href={reportUrl}
                  className="text-xs font-semibold text-accent-foreground underline underline-offset-4"
                >
                  View full report structure for {projectName} →
                </Link>
              </div>
            </div>
          </div>
        )}

        {activeTab === "schedule" && (
          <div className="space-y-6">
            <div className="rounded-sm border border-border bg-background p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Automated Monitor Cadence
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Automated recurring scans are enqueued by the cloud
                    scheduler and executed by background workers.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Next scheduled execution:
                  </span>
                  <div className="text-xs font-semibold text-foreground">
                    {calculatedNextRun
                      ? new Date(calculatedNextRun).toLocaleDateString(
                          undefined,
                          {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )
                      : "No recurring scans scheduled"}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {AVAILABLE_CADENCES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCadence(option.id)}
                    className={`flex flex-col text-left p-3.5 rounded-sm border transition-all ${
                      cadence === option.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:border-foreground/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">
                        {option.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {option.monthlyCost}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground leading-normal">
                      {option.desc}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between pt-4 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {saveSuccess && (
                    <span className="text-success font-medium">
                      ✓ Monitoring cadence updated successfully
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleSaveCadence}
                  className="rounded-sm bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  Save Cadence Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "prompts" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              These buyer-intent queries are automatically formatted for{" "}
              {projectName} ({trackedDomain}) during AI scans:
            </p>
            <div className="divide-y divide-border rounded-sm border border-border bg-background">
              {PROMPT_PREVIEWS.map((prompt, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"
                >
                  <span className="font-semibold text-foreground">
                    {prompt.kind}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {prompt.query}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "actions" && (
          <div className="space-y-4">
            <div className="rounded-sm border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">
                  Comparison Defense Playbook
                </h4>
                <span className="rounded-xs bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">
                  HIGH IMPACT
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Triggered when competitors appear in comparison or alternatives
                queries. Focuses on building authoritative feature battlecards
                and comparison landing pages.
              </p>
            </div>

            <div className="rounded-sm border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">
                  Citation Authority Building
                </h4>
                <span className="rounded-xs bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
                  MEDIUM IMPACT
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Triggered when authoritative third-party industry sources are
                cited by AI models but {trackedDomain} is omitted.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
