import "server-only";

export type AuthBoundaryFailureCode =
  | "signed_out"
  | "auth_verification_failed"
  | "invalid_claims";

export type SupabaseIdentity = Readonly<{
  userId: string;
}>;

export type SupabaseIdentityResult =
  | Readonly<{ ok: true; identity: SupabaseIdentity }>
  | Readonly<{ ok: false; code: AuthBoundaryFailureCode }>;

/**
 * Structural subset of a Supabase server client. The concrete client is wired
 * later; this boundary deliberately depends only on auth.getClaims().
 *
 * Supabase documents getClaims() as the server-side identity verification
 * primitive for protecting pages and user data. Do not replace this with a
 * user object read from getSession(), request JSON, form data, query params,
 * headers, or other caller-controlled identity fields.
 */
export type SupabaseClaimsVerifier = Readonly<{
  auth: Readonly<{
    getClaims(): Promise<
      Readonly<{
        data: Readonly<{ claims?: unknown }> | null;
        error: unknown;
      }>
    >;
  }>;
}>;

export class AuthBoundaryError extends Error {
  readonly code: AuthBoundaryFailureCode;

  constructor(code: AuthBoundaryFailureCode) {
    super(`Authentication denied: ${code}`);
    this.name = "AuthBoundaryError";
    this.code = code;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validUserId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    value.isWellFormed()
  );
}

/**
 * Derive the authenticated actor exclusively from Supabase-verified claims.
 * There is intentionally no caller-supplied userId parameter.
 */
export async function resolveSupabaseIdentity(
  verifier: SupabaseClaimsVerifier,
): Promise<SupabaseIdentityResult> {
  let response: Awaited<ReturnType<SupabaseClaimsVerifier["auth"]["getClaims"]>>;

  try {
    response = await verifier.auth.getClaims();
  } catch {
    return { ok: false, code: "auth_verification_failed" };
  }

  if (response.error !== null && response.error !== undefined)
    return { ok: false, code: "auth_verification_failed" };

  const claims = response.data?.claims;
  if (claims === null || claims === undefined)
    return { ok: false, code: "signed_out" };
  if (!record(claims) || !validUserId(claims.sub))
    return { ok: false, code: "invalid_claims" };

  return {
    ok: true,
    identity: Object.freeze({ userId: claims.sub }),
  };
}

/**
 * Fail-closed guard for server actions, route handlers, and other privileged
 * server operations. Callers must handle AuthBoundaryError as an access denial.
 */
export async function requireSupabaseIdentity(
  verifier: SupabaseClaimsVerifier,
): Promise<SupabaseIdentity> {
  const result = await resolveSupabaseIdentity(verifier);
  if (!result.ok) throw new AuthBoundaryError(result.code);
  return result.identity;
}
