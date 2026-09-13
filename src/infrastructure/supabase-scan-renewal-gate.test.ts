import assert from "node:assert/strict";
import test from "node:test";

import type { ValidatedScanLeaseRequest } from "../application/scan-worker.ts";
import { executeSupabaseScanLeaseRenewal } from "./supabase-scan-worker.ts";

const request: ValidatedScanLeaseRequest = Object.freeze({
  workspaceId: "f2000000-0000-4000-8000-000000000001",
  scanId: "f3000000-0000-4000-8000-000000000001",
  attemptId: "f4000000-0000-4000-8000-000000000001",
  workerId: "f5000000-0000-4000-8000-000000000001",
  leaseToken: "f6000000-0000-4000-8000-000000000001",
  leaseSeconds: 60,
});

test("renewal maps a mid-lease execution disable without exposing database details", async () => {
  const result = await executeSupabaseScanLeaseRenewal(request, async () => ({
    data: null,
    error: { code: "P0001", message: "Scan execution disabled" },
  }));

  assert.deepEqual(result, { ok: false, code: "execution_disabled" });
});
