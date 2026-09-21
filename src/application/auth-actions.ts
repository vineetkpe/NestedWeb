"use server";

import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";

import {
  validateEmail,
  validatePassword,
  validateAgencyName,
  validateSafeRedirect,
} from "../domain/auth-validation.ts";
import { createSupabaseServerClient } from "../infrastructure/supabase/server.ts";

export type AuthActionResult = Readonly<{
  ok: boolean;
  message: string;
  requiresEmailConfirmation?: boolean;
}>;

/**
 * Server action to sign in with email and password.
 */
export async function signInWithPasswordAction(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = validateEmail(formData.get("email"));
  const password = validatePassword(formData.get("password"));
  const rawNext = formData.get("next");
  const next = validateSafeRedirect(rawNext, "/workspace");

  if (!email) {
    return { ok: false, message: "Please provide a valid work email address." };
  }
  if (!password) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { ok: false, message: error.message };
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.name === "SupabaseConfigurationError"
        ? "Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and publishable key to .env.local."
        : "An unexpected error occurred during sign-in. Please try again.";
    return { ok: false, message };
  }

  redirect(next);
}

/**
 * Server action to create a new agency account.
 */
export async function signUpAction(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = validateEmail(formData.get("email"));
  const password = validatePassword(formData.get("password"));
  const agencyName = validateAgencyName(formData.get("agencyName"));
  const plan = formData.get("plan");

  if (!email) {
    return { ok: false, message: "Please provide a valid work email address." };
  }
  if (!password) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  if (!agencyName) {
    return {
      ok: false,
      message: "Agency name must be between 2 and 100 characters.",
    };
  }

  let redirectToWorkspace = false;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          agency_name: agencyName,
          selected_plan: typeof plan === "string" ? plan : "free_tier",
        },
      },
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    // If user has a session immediately (email confirmation disabled in project), redirect
    if (data.session) {
      redirectToWorkspace = true;
    } else {
      return {
        ok: true,
        requiresEmailConfirmation: true,
        message:
          "Account created! Please check your email to verify your address and complete setup.",
      };
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.name === "SupabaseConfigurationError"
        ? "Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and publishable key to .env.local."
        : "An unexpected error occurred during registration. Please try again.";
    return { ok: false, message };
  }

  if (redirectToWorkspace) {
    redirect("/workspace");
  }

  return { ok: true, message: "Account created successfully." };
}

/**
 * Server action to send a passwordless PKCE magic link.
 */
export async function signInWithOtpAction(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = validateEmail(formData.get("email"));

  if (!email) {
    return { ok: false, message: "Please provide a valid work email address." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const headerList = await headers();
    const host =
      headerList.get("x-forwarded-host") ??
      headerList.get("host") ??
      "localhost:3000";
    const proto = headerList.get("x-forwarded-proto") ?? "http";
    const origin = `${proto}://${host}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/workspace`,
      },
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return {
      ok: true,
      message: "Check your email! We sent you a secure magic link to sign in.",
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.name === "SupabaseConfigurationError"
        ? "Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and publishable key to .env.local."
        : "An unexpected error occurred sending magic link. Please try again.";
    return { ok: false, message };
  }
}

/**
 * Server action to sign out.
 */
export async function signOutAction(): Promise<never> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Ignore sign out failure on unconfigured environment
  }

  redirect("/login");
}
