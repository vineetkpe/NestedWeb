import test from "node:test";
import assert from "node:assert/strict";

import {
  compareProjectScans,
  type ScanHistoryGateway,
} from "./scan-history.ts";
import type { ScanComparisonInput } from "../domain/scan-comparison.ts";

function createMockScanInput(
  overrides: Partial<ScanComparisonInput>,
): ScanComparisonInput {
  return {
    scanId: overrides.scanId ?? "00000000-0000-4000-8000-000000000001",
    workspaceId:
      overrides.workspaceId ?? "11111111-1111-4111-8111-111111111111",
    projectId: overrides.projectId ?? "22222222-2222-4222-8222-222222222222",
    trackedDomain: overrides.trackedDomain ?? "acme.com",
    scannedAt: overrides.scannedAt ?? "2026-09-01T12:00:00Z",
    metrics: overrides.metrics ?? {
      methodVersion: "report-metrics-v1",
      calculatedAt: "2026-09-01T12:00:00Z",
      mentionRate: {
        state: "measured",
        methodVersion: "report-metrics-v1",
        value: 40.0,
        unit: "percentage",
        numerator: 4,
        denominator: 10,
        eligibleObservationIds: [],
        exclusions: [],
        calculatedAt: "2026-09-01T12:00:00Z",
      },
      recommendationRate: {
        state: "measured",
        methodVersion: "report-metrics-v1",
        value: 20.0,
        unit: "percentage",
        numerator: 2,
        denominator: 10,
        eligibleObservationIds: [],
        exclusions: [],
        calculatedAt: "2026-09-01T12:00:00Z",
      },
      aiShareOfVoice: {
        state: "measured",
        methodVersion: "report-metrics-v1",
        value: 30.0,
        unit: "percentage",
        numerator: 3,
        denominator: 10,
        eligibleObservationIds: [],
        exclusions: [],
        calculatedAt: "2026-09-01T12:00:00Z",
      },
      citationShare: {
        state: "measured",
        methodVersion: "report-metrics-v1",
        value: 15.0,
        unit: "percentage",
        numerator: 3,
        denominator: 20,
        eligibleObservationIds: [],
        exclusions: [],
        calculatedAt: "2026-09-01T12:00:00Z",
      },
      competitorGaps: [],
    },
    queryObservations: overrides.queryObservations ?? [
      {
        queryId: "q1",
        promptText: "best crm for sales",
        category: "comparison",
        brandMentioned: true,
        brandRecommended: false,
      },
    ],
  };
}

test("compareProjectScans rejects invalid UUID parameters", async () => {
  const gateway: ScanHistoryGateway = {
    async listProjectScans() {
      return [];
    },
    async getScanComparisonInput() {
      return null;
    },
  };

  const res = await compareProjectScans(
    {
      workspaceId: "not-a-uuid",
      projectId: "22222222-2222-4222-8222-222222222222",
      baselineScanId: "00000000-0000-4000-8000-000000000001",
      targetScanId: "00000000-0000-4000-8000-000000000002",
    },
    gateway,
  );

  assert.equal(res.ok, false);
  assert.equal(res.code, "invalid_request");
});

test("compareProjectScans rejects identical scan comparison", async () => {
  const gateway: ScanHistoryGateway = {
    async listProjectScans() {
      return [];
    },
    async getScanComparisonInput() {
      return null;
    },
  };

  const res = await compareProjectScans(
    {
      workspaceId: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      baselineScanId: "00000000-0000-4000-8000-000000000001",
      targetScanId: "00000000-0000-4000-8000-000000000001",
    },
    gateway,
  );

  assert.equal(res.ok, false);
  assert.equal(res.code, "incompatible_scans");
});

test("compareProjectScans handles missing scan gracefully", async () => {
  const gateway: ScanHistoryGateway = {
    async listProjectScans() {
      return [];
    },
    async getScanComparisonInput(id) {
      if (id === "00000000-0000-4000-8000-000000000001") {
        return createMockScanInput({ scanId: id });
      }
      return null;
    },
  };

  const res = await compareProjectScans(
    {
      workspaceId: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      baselineScanId: "00000000-0000-4000-8000-000000000001",
      targetScanId: "00000000-0000-4000-8000-000000000002",
    },
    gateway,
  );

  assert.equal(res.ok, false);
  assert.equal(res.code, "scan_not_found");
});

test("compareProjectScans denies cross-tenant scan access", async () => {
  const gateway: ScanHistoryGateway = {
    async listProjectScans() {
      return [];
    },
    async getScanComparisonInput(id) {
      if (id === "00000000-0000-4000-8000-000000000001") {
        return createMockScanInput({
          scanId: id,
          workspaceId: "11111111-1111-4111-8111-111111111111",
        });
      }
      return createMockScanInput({
        scanId: id,
        workspaceId: "99999999-9999-4999-8999-999999999999", // Different workspace
      });
    },
  };

  const res = await compareProjectScans(
    {
      workspaceId: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      baselineScanId: "00000000-0000-4000-8000-000000000001",
      targetScanId: "00000000-0000-4000-8000-000000000002",
    },
    gateway,
  );

  assert.equal(res.ok, false);
  assert.equal(res.code, "cross_tenant_denied");
});

test("compareProjectScans successfully compares two valid project scans", async () => {
  const wsId = "11111111-1111-4111-8111-111111111111";
  const projId = "22222222-2222-4222-8222-222222222222";
  const baseId = "00000000-0000-4000-8000-000000000001";
  const targetId = "00000000-0000-4000-8000-000000000002";

  const gateway: ScanHistoryGateway = {
    async listProjectScans() {
      return [];
    },
    async getScanComparisonInput(id) {
      if (id === baseId) {
        return createMockScanInput({
          scanId: baseId,
          workspaceId: wsId,
          projectId: projId,
          scannedAt: "2026-09-01T12:00:00Z",
        });
      }
      return createMockScanInput({
        scanId: targetId,
        workspaceId: wsId,
        projectId: projId,
        scannedAt: "2026-09-15T12:00:00Z",
      });
    },
  };

  const res = await compareProjectScans(
    {
      workspaceId: wsId,
      projectId: projId,
      baselineScanId: baseId,
      targetScanId: targetId,
    },
    gateway,
  );

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.report.metadata.baselineScanId, baseId);
    assert.equal(res.report.metadata.targetScanId, targetId);
    assert.equal(res.report.metadata.workspaceId, wsId);
    assert.equal(res.report.metadata.projectId, projId);
  }
});
