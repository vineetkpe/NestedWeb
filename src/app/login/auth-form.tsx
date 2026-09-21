"use client";

import Link from "next/link";
import { useState } from "react";

export type AuthMode = "signin" | "register";

interface AuthFormProps {
  initialMode?: AuthMode;
  initialPlan?: string | null;
}

export function AuthForm({
  initialMode = "signin",
  initialPlan = null,
}: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [authMethod, setAuthMethod] = useState<"magic_link" | "password">(
    "magic_link",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
      {/* Mode Switcher Tabs */}
      <div className="mb-6 flex rounded-md bg-muted p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          onClick={() => {
            setMode("signin");
            setSubmitted(false);
          }}
          className={`flex-1 rounded-sm py-2 text-center text-sm font-medium transition-colors ${
            mode === "signin"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          onClick={() => {
            setMode("register");
            setSubmitted(false);
          }}
          className={`flex-1 rounded-sm py-2 text-center text-sm font-medium transition-colors ${
            mode === "register"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Create Account
        </button>
      </div>

      {initialPlan && mode === "register" && (
        <div className="mb-4 rounded-md border border-accent bg-accent/40 p-3 text-xs text-accent-foreground">
          Selected Plan:{" "}
          <strong className="font-semibold uppercase tracking-wider">
            {initialPlan.replace("_", " ")}
          </strong>
        </div>
      )}

      {submitted ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            ✓
          </div>
          <h3 className="text-lg font-semibold">Check your email</h3>
          <p className="text-sm text-muted-foreground">
            {authMethod === "magic_link"
              ? `We sent a secure magic link to ${email || "your address"}. Click the link to complete sign in.`
              : "Account verified. You can now proceed to your workspace."}
          </p>
          <div className="pt-2">
            <Link
              href="/workspace"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Go to Workspace Dashboard →
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label
                htmlFor="auth-agency-name"
                className="block text-sm font-medium text-foreground"
              >
                Agency / Company Name
              </label>
              <input
                id="auth-agency-name"
                type="text"
                required
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                placeholder="e.g. Apex Growth Agency"
                className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="block text-sm font-medium text-foreground"
            >
              Work Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@agency.com"
              className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
            />
          </div>

          {authMethod === "password" && (
            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
              />
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() =>
                setAuthMethod(
                  authMethod === "magic_link" ? "password" : "magic_link",
                )
              }
              className="text-accent-foreground underline hover:no-underline"
            >
              {authMethod === "magic_link"
                ? "Sign in with password instead"
                : "Sign in with email magic link"}
            </button>
            {mode === "signin" && (
              <a
                href="#forgot"
                className="text-muted-foreground hover:underline"
              >
                Forgot?
              </a>
            )}
          </div>

          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            {mode === "signin"
              ? authMethod === "magic_link"
                ? "Send Magic Link"
                : "Sign In to Workspace"
              : "Create Agency Account"}
          </button>

          <div className="relative my-4 text-center">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <span className="relative bg-card px-2 text-xs text-muted-foreground">
              Or continue with
            </span>
          </div>

          <Link
            href="/workspace"
            className="inline-flex min-h-10 w-full items-center justify-center rounded-sm border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Direct Workspace Access (Signed-in Session)
          </Link>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        By continuing, you agree to the NestedWeb{" "}
        <span className="underline">Terms of Service</span> and{" "}
        <span className="underline">Privacy Policy</span>.
      </p>
    </div>
  );
}
