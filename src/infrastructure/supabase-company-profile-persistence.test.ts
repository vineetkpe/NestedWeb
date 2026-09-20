import assert from "node:assert/strict";
import { test } from "node:test";

import type { ValidatedCompanyProfilePersistenceRequest } from "../application/company-profile-persistence.ts";
import {
  executeSupabaseCompanyProfilePersistence,
  type SupabasePersistCompanyProfileSnapshotRpc,
} from "./supabase-company-profile-persistence.ts";

const unknownField = {
  status: "unknown" as const,
  reason: "no_supported_statement" as const,
};

const request: ValidatedCompanyProfilePersistenceRequest = {
  workspaceId: "b2000000-0000-4000-8000-000000000001",
  projectId: "b3000000-0000-4000-8000-000000000001",
  idempotencyKey: "b4000000-0000-4000-8000-000000000001",
  captureMethodVersion: "native-entry-page-v1",
  capturedAt: "2026-09-12T13:00:00.000Z",
  crawlResult: {
    ok: true,
    pages: [
      {
        url: "https://example.com/",
        sourceUrl: "https://example.com",
        title: "Example Corp",
        description: null,
        language: "en",
        statusCode: 200,
        markdown: "# About us\nCompany name: Example Corp",
      },
    ],
  },
  profile: {
    methodVersion: "company-profile-v2",
    fields: {
      companyName: unknownField,
      productName: unknownField,
      shortDescription: unknownField,
      primaryProduct: unknownField,
      targetAudience: unknownField,
      industry: unknownField,
      keyUseCases: unknownField,
      capabilities: unknownField,
      geography: unknownField,
    },
    excludedPages: [],
  },
};

test("maps the validated persistence request to the service-role RPC", async () => {
  let captured: unknown;
  const rpc: SupabasePersistCompanyProfileSnapshotRpc = async (args) => {
    captured = args;
    return {
      data: {
        snapshotId: "B5000000-0000-4000-8000-000000000001",
        requestFingerprint: "a".repeat(64),
        reviewState: "pending_review",
        replayed: false,
      },
      error: null,
    };
  };

  const result = await executeSupabaseCompanyProfilePersistence(request, rpc);
  assert.deepEqual(captured, {
    p_workspace_id: request.workspaceId,
    p_project_id: request.projectId,
    p_idempotency_key: request.idempotencyKey,
    p_captured_at: request.capturedAt,
    p_crawl_result: request.crawlResult,
    p_profile: request.profile,
  });
  assert.deepEqual(result, {
    ok: true,
    snapshot: {
      snapshotId: "b5000000-0000-4000-8000-000000000001",
      requestFingerprint: "a".repeat(64),
      reviewState: "pending_review",
      replayed: false,
    },
  });
});

test("maps the exact idempotency conflict without leaking database diagnostics", async () => {
  const result = await executeSupabaseCompanyProfilePersistence(
    request,
    async () => ({
      data: null,
      error: {
        code: "22023",
        message:
          "Idempotency key reused with different company profile snapshot",
        details: "untrusted database detail",
      },
    }),
  );
  assert.deepEqual(result, { ok: false, code: "idempotency_conflict" });
});

test("fails closed on malformed database responses", async () => {
  for (const response of [
    null,
    {},
    { data: {}, error: null },
    {
      data: {
        snapshotId: "not-a-uuid",
        requestFingerprint: "a".repeat(64),
        reviewState: "pending_review",
        replayed: false,
      },
      error: null,
    },
    {
      data: {
        snapshotId: "b5000000-0000-4000-8000-000000000001",
        requestFingerprint: "A".repeat(64),
        reviewState: "pending_review",
        replayed: false,
      },
      error: null,
    },
  ]) {
    const result = await executeSupabaseCompanyProfilePersistence(
      request,
      async () => response,
    );
    assert.deepEqual(result, {
      ok: false,
      code: "invalid_database_response",
    });
  }
});

test("normalizes thrown RPC failures to database_error", async () => {
  const result = await executeSupabaseCompanyProfilePersistence(
    request,
    async () => {
      throw new Error("secret database diagnostic");
    },
  );
  assert.deepEqual(result, { ok: false, code: "database_error" });
});
