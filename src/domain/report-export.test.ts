import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { CustomerAction } from "./customer-actions.ts";
import {
  escapeCsvCell,
  formatCustomerActionsAsCsv,
  formatObservationsAsCsv,
  formatReportAsJson,
  type RawObservationExportItem,
  type ReportExportData,
} from "./report-export.ts";

test("escapeCsvCell properly handles commas, quotes, newlines and nulls", () => {
  assert.equal(escapeCsvCell(null), "");
  assert.equal(escapeCsvCell(undefined), "");
  assert.equal(escapeCsvCell("simple"), "simple");
  assert.equal(escapeCsvCell(42), "42");
  assert.equal(escapeCsvCell("has,comma"), '"has,comma"');
  assert.equal(escapeCsvCell('has "quotes"'), '"has ""quotes"""');
  assert.equal(escapeCsvCell("has\nnewline"), '"has\nnewline"');
});

test("formatObservationsAsCsv outputs RFC 4180 headers and rows", () => {
  const observations: RawObservationExportItem[] = [
    {
      queryOrdinal: 0,
      queryText: 'Best tools for "email delivery", 2026',
      observationId: "obs-1234-5678",
      provider: "google",
      requestedModel: "gemini-3.6-flash",
      outcome: "answered",
      failureCode: null,
      responseDigest: "a1b2c3d4e5f6",
      observedAt: "2026-09-23T08:00:00.000Z",
    },
    {
      queryOrdinal: 1,
      queryText: "Resend vs SendGrid",
      observationId: "obs-9999-0000",
      provider: "google",
      requestedModel: "gemini-3.6-flash",
      outcome: "failed",
      failureCode: "rate_limited",
      responseDigest: null,
      observedAt: "2026-09-23T08:01:00.000Z",
    },
  ];

  const csv = formatObservationsAsCsv(observations);
  const lines = csv.split("\r\n");

  assert.equal(lines.length, 3);
  assert.equal(
    lines[0],
    "Query #,Query Text,Observation ID,Provider,Model,Outcome,Failure Code,Response Digest (SHA-256),Observed At",
  );
  assert.equal(
    lines[1],
    '1,"Best tools for ""email delivery"", 2026",obs-1234-5678,google,gemini-3.6-flash,answered,,a1b2c3d4e5f6,2026-09-23T08:00:00.000Z',
  );
  assert.equal(
    lines[2],
    "2,Resend vs SendGrid,obs-9999-0000,google,gemini-3.6-flash,failed,rate_limited,,2026-09-23T08:01:00.000Z",
  );
});

test("formatCustomerActionsAsCsv formats action proposals properly", () => {
  const actions: CustomerAction[] = [
    {
      actionId: "act-001",
      category: "comparison_defense",
      impact: "high",
      targetEntity: "SendGrid",
      title: "Publish explicit comparison page against SendGrid",
      rationale:
        "Competitor was recommended in 3 queries where target brand was absent.",
      supportingQueryIds: ["q1", "q2", "q3"],
    },
  ];

  const csv = formatCustomerActionsAsCsv(actions);
  const lines = csv.split("\r\n");

  assert.equal(lines.length, 2);
  assert.equal(
    lines[0],
    "Action ID,Category,Impact,Target Entity,Title,Rationale,Supporting Queries Count",
  );
  assert.equal(
    lines[1],
    "act-001,comparison_defense,high,SendGrid,Publish explicit comparison page against SendGrid,Competitor was recommended in 3 queries where target brand was absent.,3",
  );
});

test("formatReportAsJson generates valid and structured JSON", () => {
  const reportData: ReportExportData = {
    workspaceId: "ws-1",
    projectId: "proj-1",
    projectName: "Resend",
    trackedDomain: "resend.com",
    exportedAt: "2026-09-23T08:00:00.000Z",
    methodologyVersion: "ai-visibility-report-v1",
    queries: [{ queryOrdinal: 0, queryText: "best email api" }],
    observations: [],
    customerActions: [],
  };

  const jsonStr = formatReportAsJson(reportData);
  const parsed = JSON.parse(jsonStr) as ReportExportData;

  assert.equal(parsed.projectName, "Resend");
  assert.equal(parsed.trackedDomain, "resend.com");
  assert.equal(parsed.queries.length, 1);
});
