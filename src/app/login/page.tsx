import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm, type AuthMode } from "./auth-form.tsx";

export const metadata: Metadata = {
  title: "Sign in — AI Visibility OS",
  description: "Sign in or create your agency workspace on AI Visibility OS.",
};

type LoginPageProps = Readonly<{
  searchParams?: Promise<{
    plan?: string;
    mode?: string;
  }>;
}>;

export default async function LoginPage(props: LoginPageProps) {
  const searchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const initialMode: AuthMode =
    searchParams?.mode === "register" ? "register" : "signin";
  const initialPlan =
    typeof searchParams?.plan === "string" ? searchParams.plan.trim() : null;

  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-sm focus:bg-card focus:p-3"
        href="#main-auth"
      >
        Skip to content
      </a>

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link
            href="/"
            className="font-semibold tracking-tight text-foreground"
          >
            AI Visibility OS
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/workspace"
              className="text-accent-foreground underline underline-offset-4"
            >
              Workspace
            </Link>
          </div>
        </div>
      </header>

      <main
        id="main-auth"
        tabIndex={-1}
        className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-6xl flex-col items-center justify-center px-4 py-12 sm:px-8"
      >
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {initialMode === "register"
              ? "Start Your Agency Workspace"
              : "Sign in to AI Visibility OS"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {initialMode === "register"
              ? "Set up multi-tenant client auditing and launch evidence scans."
              : "Access your client visibility reports, metrics, and playbooks."}
          </p>
        </div>

        <AuthForm initialMode={initialMode} initialPlan={initialPlan} />
      </main>
    </>
  );
}
