import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "../login/auth-form.tsx";

export const metadata: Metadata = {
  title: "Create agency account — AI Visibility OS",
  description: "Start your free pilot or agency workspace on AI Visibility OS.",
};

type SignUpPageProps = Readonly<{
  searchParams?: Promise<{
    plan?: string;
  }>;
}>;

export default async function SignUpPage(props: SignUpPageProps) {
  const searchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const initialPlan =
    typeof searchParams?.plan === "string" ? searchParams.plan.trim() : null;

  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-sm focus:bg-card focus:p-3"
        href="#main-signup"
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
              href="/login"
              className="text-accent-foreground underline underline-offset-4"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <main
        id="main-signup"
        tabIndex={-1}
        className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-6xl flex-col items-center justify-center px-4 py-12 sm:px-8"
      >
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Start Your Agency Workspace
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create an account to track client mentions and audit citations.
          </p>
        </div>

        <AuthForm initialMode="register" initialPlan={initialPlan} />
      </main>
    </>
  );
}
