"use client";

import Link from "next/link";
import { useState } from "react";

interface ProjectDetailProps {
  workspaceId: string;
  projectId: string;
  projectName: string;
  trackedDomain: string;
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

export function ProjectDetailPanel({
  workspaceId,
  projectId,
  projectName,
  trackedDomain,
}: ProjectDetailProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "prompts" | "actions"
  >("overview");

  const reportUrl = `/report?workspaceId=${encodeURIComponent(workspaceId)}&projectId=${encodeURIComponent(projectId)}`;

  return (
    <section
      aria-labelledby="project-detail-heading"
      className="mt-6 rounded-md border border-border bg-card p-6 shadow-xs"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active Client Operations
          </span>
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
