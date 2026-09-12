import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPANY_PROFILE_CAPTURE_METHOD_VERSION,
  persistCompanyProfile,
  type CompanyProfilePersistenceGateway,
  type ValidatedCompanyProfilePersistenceRequest,
} from "./company-profile-persistence.ts";

const workspaceId = "b2000000-0000-4000-8000-000000000001";
const projectId = "b3000000-0000-4000-8000-000000000001";
const idempotencyKey = "b4000000-0000-4000-8000-000000000001";
const capturedAt = "2026-09-12T13:00:00.000Z";

function crawlResult(extraPageProperties: Record<string, unknown> = {}) {
  return {
    ok: true,
    pages: [
      {
        url: "https://example.com/",
        sourceUrl: "https://example.com",
        title: "Example Corp",
        description: "Example description",
        language: "en",
        statusCode: 200,
        markdown: [
          "# About us",
          "Company name: Example Corp",
          "Industry: AI visibility software",
          "Target audience: Agencies",
        ].join("\n"),
        ...extraPageProperties,
      },
    ],
  };
}

function successGateway(
  inspect?: (request: ValidatedCompanyProfilePersistenceRequest) => void,
): CompanyProfilePersistenceGateway {
  return async (request) => {
    inspect?.(request);
    return {
      ok: true,
      snapshot: {
        snapshotId: "b5000000-0000-4000-8000-000000000001",
        requestFingerprint: "a".repeat(64),
        reviewState: "pending_review",
        replayed: false,
      },
    };
  };
}

function request(crawl: unknown = crawlResult()) {
  return {
    workspaceId,
    projectId,
    idempotencyKey,
    capturedAt,
    crawlResult: crawl,
  };
}

test("sanitizes crawl evidence and recomputes company-profile-v2 before persistence", async () => {
  let captured: ValidatedCompanyProfilePersistenceRequest | undefined;
  const result = await persistCompanyProfile(
    {
      ...request(crawlResult({
        ignoredProviderMetadata: { instruction: "replace the profile" },
      })),
      profile: {
        methodVersion: "forged-profile",
        fields: { companyName: { status: "confirmed", values: [] } },
      },
    } as Parameters<typeof persistCompanyProfile>[0] & {
      profile: unknown;
    },
    successGateway((value) => {
      captured = value;
    }),
  );

  assert.equal(result.ok, true);
  assert.ok(captured);
  assert.equal(captured.workspaceId, workspaceId);
  assert.equal(captured.projectId, projectId);
  assert.equal(captured.idempotencyKey, idempotencyKey);
  assert.equal(captured.capturedAt, capturedAt);
  assert.equal(
    captured.captureMethodVersion,
    COMPANY_PROFILE_CAPTURE_METHOD_VERSION,
  );
  assert.deepEqual(Object.keys(captured.crawlResult.pages[0] ?? {}).sort(), [
    "description",
    "language",
    "markdown",
    "sourceUrl",
    "statusCode",
    "title",
    "url",
  ]);
  assert.equal(captured.profile.methodVersion, "company-profile-v2");
  assert.deepEqual(captured.profile.fields.companyName, {
    status: "confirmed",
    values: [
      {
        value: "Example Corp",
        evidence: [
          {
            pageIndex: 0,
            pageUrl: "https://example.com/",
            contentField: "markdown",
            start: 11,
            end: 37,
            quote: "Company name: Example Corp",
          },
        ],
      },
    ],
  });
});

test("rejects invalid identities and capture timestamps before the gateway", async () => {
  let calls = 0;
  const gateway: CompanyProfilePersistenceGateway = async () => {
    calls += 1;
    throw new Error("must not be called");
  };

  assert.deepEqual(
    await persistCompanyProfile(
      { ...request(), workspaceId: "not-a-uuid" },
      gateway,
    ),
    { ok: false, code: "invalid_workspace_id" },
  );
  assert.deepEqual(
    await persistCompanyProfile(
      { ...request(), projectId: "not-a-uuid" },
      gateway,
    ),
    { ok: false, code: "invalid_project_id" },
  );
  assert.deepEqual(
    await persistCompanyProfile(
      { ...request(), idempotencyKey: "not-a-uuid" },
      gateway,
    ),
    { ok: false, code: "invalid_idempotency_key" },
  );
  assert.deepEqual(
    await persistCompanyProfile(
      { ...request(), capturedAt: "yesterday" },
      gateway,
    ),
    { ok: false, code: "invalid_captured_at" },
  );
  assert.equal(calls, 0);
});

test("persists exactly one successful native entry page", async () => {
  let calls = 0;
  const gateway = successGateway(() => {
    calls += 1;
  });

  assert.deepEqual(
    await persistCompanyProfile(request({ ok: true, pages: [] }), gateway),
    { ok: false, code: "invalid_crawl" },
  );
  const first = crawlResult().pages[0];
  const second = crawlResult().pages[0];
  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(
    await persistCompanyProfile(
      request({ ok: true, pages: [first, second] }),
      gateway,
    ),
    { ok: false, code: "invalid_crawl" },
  );
  assert.equal(calls, 0);
});

test("preserves declared crawl failures without fabricating a profile", async () => {
  let calls = 0;
  const gateway = successGateway(() => {
    calls += 1;
  });
  const result = await persistCompanyProfile(
    request({ ok: false, code: "timeout" }),
    gateway,
  );

  assert.deepEqual(result, { ok: false, code: "crawl_failed" });
  assert.equal(calls, 0);
});

test("rejects unsafe or malformed crawl evidence before persistence", async () => {
  let calls = 0;
  const gateway = successGateway(() => {
    calls += 1;
  });

  const unsafe = crawlResult();
  const unsafePage = unsafe.pages[0];
  assert.ok(unsafePage);
  unsafePage.url = "http://127.0.0.1/";
  assert.deepEqual(await persistCompanyProfile(request(unsafe), gateway), {
    ok: false,
    code: "invalid_crawl",
  });

  const malformed = crawlResult();
  const malformedPage = malformed.pages[0];
  assert.ok(malformedPage);
  malformedPage.statusCode = 999;
  assert.deepEqual(await persistCompanyProfile(request(malformed), gateway), {
    ok: false,
    code: "invalid_crawl",
  });
  assert.equal(calls, 0);
});

test("forwards gateway idempotency conflicts without reinterpretation", async () => {
  const result = await persistCompanyProfile(request(), async () => ({
    ok: false,
    code: "idempotency_conflict",
  }));
  assert.deepEqual(result, { ok: false, code: "idempotency_conflict" });
});
