export type WorkspaceProjectSetupStatus = Readonly<{
  available: boolean;
  missing: readonly string[];
  message: string;
}>;

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

function configValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.isWellFormed() ? trimmed : null;
}

export function getWorkspaceProjectSetupStatus(
  env: Record<string, unknown>,
): WorkspaceProjectSetupStatus {
  const missing = REQUIRED_KEYS.filter((key) => configValue(env[key]) === null);

  if (missing.length === 0) {
    return Object.freeze({
      available: true,
      missing: Object.freeze([]),
      message: "Signed-in workspace setup is ready.",
    });
  }

  return Object.freeze({
    available: false,
    missing: Object.freeze([...missing]),
    message:
      "Workspace setup is unavailable until Supabase configuration is added.",
  });
}
