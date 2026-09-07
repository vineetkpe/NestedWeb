import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Report prototype — AI Visibility OS",
};

const queryTemplates = [
  { kind: "Category discovery", text: "Which platforms serve [category]?" },
  {
    kind: "Best tools/platforms",
    text: "What are the best tools for [buyer need]?",
  },
  { kind: "Alternatives", text: "What are alternatives to [brand]?" },
  {
    kind: "Comparison",
    text: "How does [brand] compare with [competitor] for [use case]?",
  },
  {
    kind: "Use-case recommendation",
    text: "Which platform fits [use case] for [team]?",
  },
  {
    kind: "Buyer intent",
    text: "Which [category] platform fits [budget] and [requirements]?",
  },
];

const evidenceSections = [
  {
    id: "observations",
    title: "Raw observations",
    empty: "No observations collected yet.",
    description:
      "The exact answer will appear here with its query, provider, model when disclosed, observation ID, and capture time. No AI queries have been run for this report.",
  },
  {
    id: "citations",
    title: "Citations and evidence",
    empty: "No citations recorded yet.",
    description:
      "Each returned source will link to its observation, original URL, source domain, capture time, and relationship to the answer. A citation alone does not prove that a source supports a claim.",
  },
  {
    id: "interpretation",
    title: "Interpretation",
    empty: "No interpretations available yet.",
    description:
      "Brand mentions, positive recommendations, competitor mentions, and source associations will point to supporting answer excerpts. Ambiguous context will remain labeled as uncertain.",
  },
];

const metricDefinitions = [
  {
    name: "Mention Rate",
    meaning:
      "Eligible answers that mention the company, divided by answers with completed mention analysis.",
  },
  {
    name: "Recommendation Rate",
    meaning:
      "Eligible answers that positively recommend the company, divided by answers with completed recommendation analysis.",
  },
  {
    name: "AI Share of Voice",
    meaning:
      "The company’s answer-level mentions as a share of mentions across a fixed set of compared brands. Each brand counts once per answer.",
  },
  {
    name: "Citation Share",
    meaning:
      "Returned cited URLs matching the company’s domain scope as a share of all eligible cited URLs. Duplicate URLs count once per answer.",
  },
  {
    name: "Competitor Gap",
    meaning:
      "Each competitor’s recommendation rate minus the company’s rate on the same eligible answers, in percentage points.",
  },
];

export default function ReportPage() {
  return (
    <>
      <a
        href="#report"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-sm focus:bg-card focus:p-3"
      >
        Skip to report
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <span className="font-semibold">AI Visibility OS</span>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm text-accent-foreground underline underline-offset-4"
          >
            Back to product preview
          </Link>
        </div>
      </header>
      <main
        id="report"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12"
      >
        <div className="mb-8 max-w-2xl">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            Report prototype
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            AI visibility report
          </h1>
          <p className="mt-4 text-muted-foreground">
            Follow a company’s presence from the original answers to the actions
            they support. This prototype shows the report structure; no company
            or observations have been added.
          </p>
        </div>
        <nav
          aria-label="Report sections"
          className="mb-8 flex flex-wrap gap-x-6 gap-y-1 border-y border-border py-2 text-sm"
        >
          {[
            { id: "company", label: "Company" },
            { id: "queries", label: "Queries" },
            { id: "observations", label: "Observations" },
            { id: "citations", label: "Citations" },
            { id: "interpretation", label: "Interpretation" },
            { id: "metrics", label: "Metrics" },
            { id: "recommendations", label: "Recommendations" },
          ].map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex min-h-11 items-center text-accent-foreground underline underline-offset-4"
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="divide-y divide-border rounded-md border border-border bg-card px-4 sm:px-8">
          <section
            id="company"
            aria-labelledby="company-title"
            className="scroll-mt-6 py-8"
          >
            <h2 id="company-title" className="text-xl font-semibold">
              Company
            </h2>
            <dl className="mt-6 grid gap-6 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">Company name</dt>
                <dd className="mt-1 font-medium">Company not selected</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  Website/domain
                </dt>
                <dd className="mt-1">Not provided</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Report date</dt>
                <dd className="mt-1">Not generated</dd>
              </div>
            </dl>
          </section>
          <section
            id="queries"
            aria-labelledby="queries-title"
            className="scroll-mt-6 py-8"
          >
            <h2 id="queries-title" className="text-xl font-semibold">
              Queries
            </h2>
            <p className="mt-2 text-muted-foreground">
              Query templates only. None have been executed.
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Bracketed terms need the company’s actual category, buyers, and
              competitors before questions can be selected.
            </p>
            <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {queryTemplates.map((query) => (
                <div key={query.kind}>
                  <dt className="font-medium">{query.kind}</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    {query.text}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          {evidenceSections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className="scroll-mt-6 py-8"
            >
              <h2 id={`${section.id}-title`} className="text-xl font-semibold">
                {section.title}
              </h2>
              <p className="mt-4 font-medium">{section.empty}</p>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {section.description}
              </p>
            </section>
          ))}
          <section
            id="metrics"
            aria-labelledby="metrics-title"
            className="scroll-mt-6 py-8"
          >
            <h2 id="metrics-title" className="text-xl font-semibold">
              Metrics
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              No eligible observations are available. Each future result will
              show its supporting observations, numerator, denominator,
              exclusions, and method. Missing evidence is not a zero score.
            </p>
            <table className="mt-6 w-full table-fixed border-collapse text-left text-sm">
              <caption className="sr-only">Visibility metrics</caption>
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="w-2/3 p-3 font-medium sm:w-3/4">
                    Metric and definition
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {metricDefinitions.map((metric) => (
                  <tr
                    key={metric.name}
                    className="border-b border-border last:border-0"
                  >
                    <th scope="row" className="p-3 align-top font-normal">
                      <span className="font-medium">{metric.name}</span>
                      <p className="mt-2 max-w-xl text-muted-foreground">
                        {metric.meaning}
                      </p>
                    </th>
                    <td className="p-3 align-top text-muted-foreground">
                      Not measured
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section
            id="recommendations"
            aria-labelledby="recommendations-title"
            className="scroll-mt-6 py-8"
          >
            <h2 id="recommendations-title" className="text-xl font-semibold">
              Recommendations
            </h2>
            <p className="mt-4 font-medium">
              No evidence-based actions available yet.
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Each action will identify its reason, target, expected impact,
              effort, priority, and supporting evidence. Impact will be an
              explained hypothesis, not a promised ranking improvement.
            </p>
          </section>
        </div>
        <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
          A report describes sampled answers. It does not establish market
          share, guarantee future mentions, or show a trend from a single
          snapshot.
        </p>
      </main>
    </>
  );
}
