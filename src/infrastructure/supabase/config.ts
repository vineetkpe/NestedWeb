export type SupabasePublicConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

function configured(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.isWellFormed() ? trimmed : null;
}

function safeSupabaseUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.username !== "" || parsed.password !== "") return false;
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "")
    return false;
  if (parsed.protocol === "https:") return true;

  return (
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  );
}

export function requireSupabasePublicConfig(
  input: Readonly<{
    url: string | undefined;
    publishableKey: string | undefined;
  }>,
): SupabasePublicConfig {
  const url = configured(input.url);
  const publishableKey = configured(input.publishableKey);

  if (url === null)
    throw new SupabaseConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL must be configured.",
    );
  if (!safeSupabaseUrl(url))
    throw new SupabaseConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL must be an HTTPS origin or a local HTTP origin.",
    );
  if (publishableKey === null || publishableKey.length > 4096)
    throw new SupabaseConfigurationError(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be configured.",
    );

  return Object.freeze({ url, publishableKey });
}
