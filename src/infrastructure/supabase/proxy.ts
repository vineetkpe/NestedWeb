import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requireSupabasePublicConfig } from "./config.ts";

function authNotConfigured(): boolean {
  return (
    (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "") === "" &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "") === ""
  );
}

/**
 * Refresh Supabase's cookie-backed Auth session before Server Components read
 * it. This is session maintenance only; authorization still happens through
 * verified claims at the server boundary.
 */
export async function updateSupabaseSession(request: NextRequest) {
  if (authNotConfigured()) return NextResponse.next({ request });

  const config = requireSupabasePublicConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet)
          request.cookies.set(name, value);

        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims verifies the access token and performs refresh work when needed.
  // Its authorization result is intentionally not consumed here.
  await supabase.auth.getClaims();

  return response;
}
