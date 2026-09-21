import { NextResponse, type NextRequest } from "next/server.js";

import { validateSafeRedirect } from "../../../domain/auth-validation.ts";
import { createSupabaseServerClient } from "../../../infrastructure/supabase/server.ts";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const rawNext = requestUrl.searchParams.get("next");
  const safeNext = validateSafeRedirect(rawNext, "/workspace");

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
      }
    } catch {
      // Configuration error or network error
      return NextResponse.redirect(
        new URL("/login?error=auth_callback_failed", requestUrl.origin),
      );
    }
  }

  // If no code or exchange failed, redirect to login
  return NextResponse.redirect(
    new URL("/login?error=invalid_auth_request", requestUrl.origin),
  );
}
