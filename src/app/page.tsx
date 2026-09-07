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
          <span className="font-semibold tracking-tight">AI Visibility OS</span>
          <span className="text-sm text-muted-foreground">Product preview</span>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-12 sm:px-8 sm:py-16"
      >
        <section
          aria-labelledby="intro-title"
          className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-center"
        >
          <div className="flex flex-col items-start gap-6">
            <h1
              id="intro-title"
              className="max-w-xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl"
            >
              Every answer needs evidence.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Understand how AI answers mention and cite your clients. Start
              with what was observed, then trace each insight back to its
              source.
            </p>
            <a
              href="#methodology"
              className="inline-flex min-h-11 items-center rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover"
            >
              How evidence works
            </a>
          </div>
          <aside
            aria-labelledby="observation-title"
            className="flex flex-col gap-4 rounded-md border border-border bg-card p-6 sm:p-8"
          >
            <span className="text-sm font-medium text-muted-foreground">
              Observation status
            </span>
            <h2 id="observation-title" className="text-xl font-semibold">
              No observations collected
            </h2>
            <p className="text-muted-foreground">
              This preview contains no visibility results. Monitoring and
              workspace setup are not available yet.
            </p>
            <p className="border-t border-border pt-4 text-sm text-muted-foreground">
              Visibility metrics will appear only when they can be supported by
              recorded answers.
            </p>
          </aside>
        </section>
        <section
          id="methodology"
          aria-labelledby="methodology-title"
          className="scroll-mt-6 border-t border-border pt-8"
        >
          <h2
            id="methodology-title"
            className="text-2xl font-semibold tracking-tight"
          >
            From observation to insight
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            An answer, a measurement, and a recommendation are different things.
            Keeping the evidence between them visible makes the result easier to
            assess.
          </p>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <li className="flex flex-col gap-2">
              <span className="text-sm font-medium text-accent-foreground">
                1. Observe
              </span>
              <h3 className="font-semibold">Keep the original answer</h3>
              <p className="text-sm text-muted-foreground">
                Record the query, provider, model, time, and returned citations.
              </p>
            </li>
            <li className="flex flex-col gap-2">
              <span className="text-sm font-medium text-accent-foreground">
                2. Interpret
              </span>
              <h3 className="font-semibold">Identify what appeared</h3>
              <p className="text-sm text-muted-foreground">
                Separate mentions and citations from ambiguity or missing
                information.
              </p>
            </li>
            <li className="flex flex-col gap-2">
              <span className="text-sm font-medium text-accent-foreground">
                3. Measure
              </span>
              <h3 className="font-semibold">Explain the calculation</h3>
              <p className="text-sm text-muted-foreground">
                Show the sample, time window, and method behind each metric.
              </p>
            </li>
            <li className="flex flex-col gap-2">
              <span className="text-sm font-medium text-accent-foreground">
                4. Recommend
              </span>
              <h3 className="font-semibold">Make the reasoning inspectable</h3>
              <p className="text-sm text-muted-foreground">
                Connect suggestions to evidence and make their limitations
                clear.
              </p>
            </li>
          </ol>
        </section>
      </main>
      <footer className="mx-auto max-w-6xl border-t border-border px-4 py-6 text-sm text-muted-foreground sm:px-8">
        Observations describe sampled answers. They do not guarantee future
        mentions, citations, or rankings.
      </footer>
    </>
  );
}
