import type { CustomerAction } from "./customer-actions.ts";

export type RawObservationExportItem = Readonly<{
  queryOrdinal: number;
  queryText: string;
  observationId: string;
  provider: string;
  requestedModel: string;
  outcome: string;
  failureCode: string | null;
  responseDigest: string | null;
  observedAt: string;
}>;

export type ReportExportData = Readonly<{
  workspaceId: string;
  projectId: string;
  projectName: string;
  trackedDomain: string;
  exportedAt: string;
  methodologyVersion: string;
  queries: readonly Readonly<{
    queryOrdinal: number;
    queryText: string;
  }>[];
  observations: readonly RawObservationExportItem[];
  customerActions: readonly CustomerAction[];
}>;

/**
 * Escapes a cell according to RFC 4180 rules:
 * - Wrap with double quotes if cell contains commas, double quotes, or newlines.
 * - Double quotes inside are doubled ("").
 */
export function escapeCsvCell(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats a list of raw observations into standard RFC 4180 CSV format.
 */
export function formatObservationsAsCsv(
  observations: readonly RawObservationExportItem[],
): string {
  const headers = [
    "Query #",
    "Query Text",
    "Observation ID",
    "Provider",
    "Model",
    "Outcome",
    "Failure Code",
    "Response Digest (SHA-256)",
    "Observed At",
  ];

  const rows = [headers.map(escapeCsvCell).join(",")];

  for (const obs of observations) {
    const row = [
      obs.queryOrdinal + 1,
      obs.queryText,
      obs.observationId,
      obs.provider,
      obs.requestedModel,
      obs.outcome,
      obs.failureCode ?? "",
      obs.responseDigest ?? "",
      obs.observedAt,
    ];
    rows.push(row.map(escapeCsvCell).join(","));
  }

  return rows.join("\r\n");
}

/**
 * Formats customer action recommendations into standard RFC 4180 CSV format.
 */
export function formatCustomerActionsAsCsv(
  actions: readonly CustomerAction[],
): string {
  const headers = [
    "Action ID",
    "Category",
    "Impact",
    "Target Entity",
    "Title",
    "Rationale",
    "Supporting Queries Count",
  ];

  const rows = [headers.map(escapeCsvCell).join(",")];

  for (const action of actions) {
    const row = [
      action.actionId,
      action.category,
      action.impact,
      action.targetEntity,
      action.title,
      action.rationale,
      action.supportingQueryIds.length,
    ];
    rows.push(row.map(escapeCsvCell).join(","));
  }

  return rows.join("\r\n");
}

/**
 * Formats full report export data into a clean, formatted JSON string.
 */
export function formatReportAsJson(data: ReportExportData): string {
  return JSON.stringify(data, null, 2);
}
