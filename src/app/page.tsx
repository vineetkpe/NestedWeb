import Link from "next/link";

import { getWorkspaceProjectSetupStatus } from "../application/workspace-project-setup.ts";

const setupStatus = getWorkspaceProjectSetupStatus(process.env);

export default function HomePage() {
  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-sm focus:bg-card focus:p-3"
        href="#main"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2.5 font-semibold tracking-tight text-foreground"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-xs font-bold text-primary-foreground shadow-xs">
                OS
              </span>
              <span>AI Visibility OS</span>
            </Link>
            <nav className="hidden md:flex md:items-center md:gap-5 text-sm">
              <Link
                href="/workspace"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Workspace
              </Link>
              <Link
                href="/report"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Report
              </Link>
              <a
                href="#methodology"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Methodology
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/login"
              className="px-3 py-1.5 font-medium text-foreground hover:text-accent-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="rounded-sm bg-primary px-3.5 py-1.5 font-medium text-primary-foreground hover:bg-primary-hover transition-colors shadow-xs"
            >
              Register
            </Link>
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-12 sm:px-8 sm:py-16"
      >
        <section
          aria-labelledby="intro-title"
          className="grid gap-10 md:grid-cols-[1.3fr_1fr] md:items-center"
        >
          <div className="flex flex-col items-start gap-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Precision AI Visibility for SEO & GEO Agencies</span>
            </div>
            <h1
              id="intro-title"
              className="max-w-xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl"
            >
              Every answer needs evidence.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground leading-relaxed">
              Understand how AI answers mention and cite your clients. Start
              with what was observed, then trace each insight back to its
              source.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-sm bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover shadow-xs"
              >
                Sign In to Platform →
              </Link>
              <a
                href="#methodology"
                className="inline-flex min-h-11 items-center rounded-sm border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted shadow-xs"
              >
                How evidence works
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-5 pt-1">
              <Link
                href="/workspace"
                className="inline-flex min-h-11 items-center text-sm font-medium text-accent-foreground underline underline-offset-4 hover:opacity-80 transition-opacity"
              >
                Set up workspace
              </Link>
              <Link
                href="/report"
                className="inline-flex min-h-11 items-center text-sm font-medium text-accent-foreground underline underline-offset-4 hover:opacity-80 transition-opacity"
              >
                Explore the report prototype
              </Link>
            </div>
          </div>
          <aside
            aria-labelledby="observation-title"
            className="flex flex-col gap-4 rounded-md border border-border bg-card p-6 sm:p-8 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Workspace setup status
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                  setupStatus.available
                    ? "bg-success/10 text-success border border-success/20"
                    : "bg-warning/10 text-warning border border-warning/20"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${setupStatus.available ? "bg-success" : "bg-warning"}`}
                />
                {setupStatus.available ? "Operational" : "Pending"}
              </span>
            </div>
            <h2
              id="observation-title"
              className="text-xl font-semibold text-foreground"
            >
              {setupStatus.available
                ? "Signed-in workspace flow ready"
                : "Setup pending"}
            </h2>
            <p className="text-sm font-medium text-muted-foreground">
              No observations collected
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {setupStatus.message}
            </p>
            {setupStatus.available ? (
              <p className="border-t border-border pt-4 text-xs text-muted-foreground leading-relaxed">
                The application can begin a signed-in workspace and project flow
                when the authenticated user enters a real client project.
              </p>
            ) : (
              <div className="border-t border-border pt-4 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  Missing environment values:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {setupStatus.missing.map((key) => (
                    <li key={key} className="font-mono">
                      {key}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </section>
        <section
          id="methodology"
          aria-labelledby="methodology-title"
          className="scroll-mt-6 border-t border-border pt-10"
        >
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Core Intelligence Methodology
            </span>
            <h2
              id="methodology-title"
              className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl text-foreground"
            >
              From observation to insight
            </h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              An answer, a measurement, and a recommendation are different
              things. Keeping the evidence between them visible makes the result
              easier to assess.
            </p>
          </div>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <li className="flex flex-col gap-2.5 rounded-md border border-border bg-card p-5 shadow-xs transition-colors hover:border-foreground/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-accent-foreground font-mono">
                1. Observe
              </span>
              <h3 className="font-semibold text-foreground">
                Keep the original answer
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Record the query, provider, model, time, and returned citations.
              </p>
            </li>
            <li className="flex flex-col gap-2.5 rounded-md border border-border bg-card p-5 shadow-xs transition-colors hover:border-foreground/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-accent-foreground font-mono">
                2. Interpret
              </span>
              <h3 className="font-semibold text-foreground">
                Identify what appeared
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Separate mentions and citations from ambiguity or missing
                information.
              </p>
            </li>
            <li className="flex flex-col gap-2.5 rounded-md border border-border bg-card p-5 shadow-xs transition-colors hover:border-foreground/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-accent-foreground font-mono">
                3. Measure
              </span>
              <h3 className="font-semibold text-foreground">
                Explain the calculation
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Show the sample, time window, and method behind each metric.
              </p>
            </li>
            <li className="flex flex-col gap-2.5 rounded-md border border-border bg-card p-5 shadow-xs transition-colors hover:border-foreground/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-accent-foreground font-mono">
                4. Recommend
              </span>
              <h3 className="font-semibold text-foreground">
                Make the reasoning inspectable
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Connect suggestions to evidence and make their limitations
                clear.
              </p>
            </li>
          </ol>
        </section>
      </main>
      <footer className="mx-auto max-w-6xl border-t border-border px-4 py-8 text-xs text-muted-foreground sm:px-8">
        Observations describe sampled answers. They do not guarantee future
        mentions, citations, or rankings.
      </footer>
    </>
  );
}
