const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates an email address.
 * Returns trimmed lowercased email string if valid, otherwise null.
 */
export function validateEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length < 5 || trimmed.length > 254) return null;
  if (!trimmed.isWellFormed()) return null;
  if (!EMAIL_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validates password complexity.
 * Requires minimum 8 characters, maximum 128 characters.
 */
export function validatePassword(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length < 8 || value.length > 128) return null;
  if (!value.isWellFormed()) return null;
  return value;
}

/**
 * Validates agency or company name.
 * Requires 2 to 100 characters.
 */
export function validateAgencyName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return null;
  if (!trimmed.isWellFormed()) return null;
  return trimmed;
}

/**
 * Strictly validates internal redirect targets to prevent Open Redirect vulnerabilities.
 * Prevents protocol-relative URLs (//evil.com), URI schemes (javascript:, data:),
 * and external hosts.
 */
export function validateSafeRedirect(
  value: unknown,
  fallback: string = "/workspace",
): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();

  // Must be a relative path starting with a single '/'
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  // Must not contain backslashes (which some browsers treat as slashes)
  if (trimmed.includes("\\")) {
    return fallback;
  }

  // Check for embedded schemes before any query or hash
  const pathPart = trimmed.split(/[?#]/)[0] ?? "";
  if (pathPart.includes(":")) {
    return fallback;
  }

  return trimmed;
}
