import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseIdentity } from "../supabase-auth.ts";
import { requireSupabasePublicConfig } from "./config.ts";

/**
 * Request-scoped Supabase client for Server Components, Server Actions, and
 * Route Handlers. Session refresh cookie writes from a Server Component can be
 * rejected by Next.js; the root Proxy refreshes sessions before rendering.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const config = requireSupabasePublicConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet)
            cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot write response cookies. The Proxy owns
          // refresh writes for that rendering path.
        }
      },
    },
  });
}

/**
 * Canonical server-side actor lookup. Identity comes from verified Supabase
 * claims; callers cannot provide or override a user ID.
 */
export async function requireCurrentSupabaseIdentity() {
  const client = await createSupabaseServerClient();
  return requireSupabaseIdentity(client);
}
