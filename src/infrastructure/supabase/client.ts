import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicConfig } from "./config.ts";

/**
 * Browser-side Supabase client for cookie-backed Auth flows. This does not
 * authorize privileged operations; server code must still verify identity.
 */
export function createSupabaseBrowserClient() {
  const config = requireSupabasePublicConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  return createBrowserClient(config.url, config.publishableKey);
}
