import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AuthBoundaryError,
  requireSupabaseIdentity,
  resolveSupabaseIdentity,
  type SupabaseClaimsVerifier,
} from "./supabase-auth.ts";

function verifier(
  getClaims: SupabaseClaimsVerifier["auth"]["getClaims"],
): SupabaseClaimsVerifier {
  return { auth: { getClaims } };
}

test("derives identity only from the verified Supabase subject claim", async () => {
  const result = await resolveSupabaseIdentity(
    verifier(async () => ({
      data: {
        claims: {
          sub: "0b60e9e0-5df5-4f38-8267-520f27d80f6c",
          userId: "caller-controlled-user",
          actorId: "another-untrusted-id",
        },
      },
      error: null,
    })),
  );

  assert.deepEqual(result, {
    ok: true,
    identity: { userId: "0b60e9e0-5df5-4f38-8267-520f27d80f6c" },
  });
});

test("denies signed-out requests when Supabase returns no verified claims", async () => {
  const auth = verifier(async () => ({ data: null, error: null }));

  assert.deepEqual(await resolveSupabaseIdentity(auth), {
    ok: false,
    code: "signed_out",
  });

  await assert.rejects(
    requireSupabaseIdentity(auth),
    (error: unknown) =>
      error instanceof AuthBoundaryError && error.code === "signed_out",
  );
});

test("fails closed when Supabase claim verification returns an error", async () => {
  const result = await resolveSupabaseIdentity(
    verifier(async () => ({
      data: null,
      error: new Error("synthetic verification failure"),
    })),
  );

  assert.deepEqual(result, {
    ok: false,
    code: "auth_verification_failed",
  });
});

test("fails closed when the Supabase verifier throws", async () => {
  const result = await resolveSupabaseIdentity(
    verifier(async () => {
      throw new Error("synthetic verifier exception");
    }),
  );

  assert.deepEqual(result, {
    ok: false,
    code: "auth_verification_failed",
  });
});

test("rejects verified claim payloads without a usable subject", async () => {
  const badClaims = [
    {},
    { sub: "" },
    { sub: " user-with-whitespace" },
    { sub: 123 },
    [],
  ];

  for (const claims of badClaims) {
    const result = await resolveSupabaseIdentity(
      verifier(async () => ({ data: { claims }, error: null })),
    );
    assert.deepEqual(result, { ok: false, code: "invalid_claims" });
  }
});

test("snapshots the verified subject into an immutable identity", async () => {
  const claims = { sub: "7cb3908d-acde-4b52-9531-5769d56886bd" };
  const identity = await requireSupabaseIdentity(
    verifier(async () => ({ data: { claims }, error: null })),
  );

  claims.sub = "mutated-after-verification";

  assert.equal(identity.userId, "7cb3908d-acde-4b52-9531-5769d56886bd");
  assert.equal(Object.isFrozen(identity), true);
});
