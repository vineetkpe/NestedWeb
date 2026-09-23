"use client";

import React, { useState } from "react";
import type { CustomerAction } from "../../domain/customer-actions.ts";
import {
  formatCustomerActionsAsCsv,
  formatObservationsAsCsv,
  formatReportAsJson,
  type RawObservationExportItem,
  type ReportExportData,
} from "../../domain/report-export.ts";

export type ReportExportMenuProps = Readonly<{
  workspaceId: string;
  projectId: string;
  projectName: string;
  trackedDomain: string;
  queries: readonly Readonly<{
    queryOrdinal: number;
    queryText: string;
  }>[];
  observations: readonly RawObservationExportItem[];
  customerActions: readonly CustomerAction[];
}>;

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function sanitizeFilenamePart(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-");
}

export function ReportExportMenu({
  workspaceId,
  projectId,
  projectName,
  trackedDomain,
  queries,
  observations,
  customerActions,
}: ReportExportMenuProps) {
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const dateStamp = new Date().toISOString().split("T")[0];
  const safeName = sanitizeFilenamePart(projectName);

  const handleExportObservationsCsv = () => {
    const csv = formatObservationsAsCsv(observations);
    const filename = `ai-visibility-evidence-${safeName}-${dateStamp}.csv`;
    triggerDownload(csv, filename, "text/csv;charset=utf-8;");
    setDownloadSuccess("Evidence CSV downloaded");
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleExportActionsCsv = () => {
    const csv = formatCustomerActionsAsCsv(customerActions);
    const filename = `ai-visibility-actions-${safeName}-${dateStamp}.csv`;
    triggerDownload(csv, filename, "text/csv;charset=utf-8;");
    setDownloadSuccess("Actions CSV downloaded");
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleExportJson = () => {
    const data: ReportExportData = {
      workspaceId,
      projectId,
      projectName,
      trackedDomain,
      exportedAt: new Date().toISOString(),
      methodologyVersion: "ai-visibility-report-v1",
      queries,
      observations,
      customerActions,
    };
    const jsonStr = formatReportAsJson(data);
    const filename = `ai-visibility-report-${safeName}-${dateStamp}.json`;
    triggerDownload(jsonStr, filename, "application/json;charset=utf-8;");
    setDownloadSuccess("Full report JSON downloaded");
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleExportObservationsCsv}
          className="inline-flex min-h-9 items-center rounded-sm border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none"
          title="Download raw AI answer evidence as RFC 4180 CSV"
        >
          Export Evidence (CSV)
        </button>

        {customerActions.length > 0 ? (
          <button
            type="button"
            onClick={handleExportActionsCsv}
            className="inline-flex min-h-9 items-center rounded-sm border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none"
            title="Download customer recommendations as RFC 4180 CSV"
          >
            Export Actions (CSV)
          </button>
        ) : null}

        <button
          type="button"
          onClick={handleExportJson}
          className="inline-flex min-h-9 items-center rounded-sm border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none"
          title="Download complete structured audit data as JSON"
        >
          Export Audit (JSON)
        </button>

        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex min-h-9 items-center rounded-sm border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none"
          title="Open print view or save as PDF"
        >
          Print / PDF
        </button>
      </div>

      {downloadSuccess ? (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-success"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {downloadSuccess}
        </span>
      ) : null}
    </div>
  );
}
