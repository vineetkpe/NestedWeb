import type { Metadata } from "next";
import Link from "next/link";

import { listCurrentUserProjects } from "../../infrastructure/supabase/projects-server.ts";
import { createSupabaseServerClient } from "../../infrastructure/supabase/server.ts";
import { CustomerActionsPanel } from "./customer-actions-panel.tsx";
import { ScanComparisonPanel } from "./scan-comparison-panel.tsx";

export const metadata: Metadata = {
  title: "Report prototype — AI Visibility OS",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

type ReportPageProps = Readonly<{
  searchParams?: Promise<{
    workspaceId?: string;
    projectId?: string;
  }>;
}>;

export default async function ReportPage(props: ReportPageProps) {
  const searchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const rawWorkspaceId = searchParams?.workspaceId?.trim().toLowerCase();
  const rawProjectId = searchParams?.projectId?.trim().toLowerCase();

  const workspaceId =
    rawWorkspaceId && UUID_PATTERN.test(rawWorkspaceId) ? rawWorkspaceId : null;
  const projectId =
    rawProjectId && UUID_PATTERN.test(rawProjectId) ? rawProjectId : null;

  let loadedProject: {
    projectId: string;
    name: string;
    trackedDomain: string;
  } | null = null;
  let projectLookupError: string | null = null;
  let latestScan: {
    id: string;
    state: string;
    created_at: string;
    query_count: number;
    prompt_method_version: string;
  } | null = null;
  let scanQueries: readonly {
    query_ordinal: number;
    query_id: string;
    query_version: string;
    query_text: string;
  }[] = [];
  let rawObservations: readonly {
    query_ordinal: number;
    observation_id: string;
    provider: string;
    requested_model: string;
    outcome: string;
    failure_code: string | null;
    response_digest: string | null;
    observed_at: string;
    raw_response_state: string;
  }[] = [];

  if (workspaceId && projectId) {
    try {
      const listResult = await listCurrentUserProjects({ workspaceId });
      if (listResult.ok) {
        const found = listResult.projects.find(
          (p) => p.projectId === projectId,
        );
        if (found) {
          loadedProject = {
            projectId: found.projectId,
            name: found.name,
            trackedDomain: found.trackedDomain,
          };

          const client = await createSupabaseServerClient();
          const { data: scans } = await client
            .from("scans")
            .select("id, state, created_at, query_count, prompt_method_version")
            .eq("workspace_id", workspaceId)
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(1);

          if (scans && scans.length > 0 && scans[0]) {
            const firstScan = scans[0];
            latestScan = firstScan;

            const { data: queries } = await client
              .from("scan_queries")
              .select("query_ordinal, query_id, query_version, query_text")
              .eq("workspace_id", workspaceId)
              .eq("scan_id", firstScan.id)
              .order("query_ordinal", { ascending: true });
            if (queries && queries.length > 0) scanQueries = queries;

            const { data: obs } = await client
              .from("raw_observations")
              .select(
                "query_ordinal, observation_id, provider, requested_model, outcome, failure_code, response_digest, observed_at, raw_response_state",
              )
              .eq("workspace_id", workspaceId)
              .eq("project_id", projectId)
              .eq("scan_id", firstScan.id)
              .order("query_ordinal", { ascending: true });
            if (obs && obs.length > 0) rawObservations = obs;
          }
        } else {
          projectLookupError = "Project not found in this workspace.";
        }
      } else {
        projectLookupError = "Workspace access denied or unavailable.";
      }
    } catch {
      projectLookupError =
        "Workspace authentication or configuration unavailable.";
    }
  }

  const companyName = loadedProject
    ? loadedProject.name
    : "Company not selected";
  const companyDomain = loadedProject
    ? loadedProject.trackedDomain
    : "Not provided";
  const reportDate = latestScan
    ? new Date(latestScan.created_at).toISOString().split("T")[0]
    : loadedProject
      ? "Awaiting scan execution"
      : "Not generated";

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
          {loadedProject ? (
            <Link
              href="/workspace"
              className="inline-flex min-h-11 items-center text-sm text-accent-foreground underline underline-offset-4"
            >
              Back to workspace
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex min-h-11 items-center text-sm text-accent-foreground underline underline-offset-4"
            >
              Back to product preview
            </Link>
          )}
        </div>
      </header>
      <main
        id="report"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12"
      >
        {projectLookupError ? (
          <div
            role="alert"
            className="mb-8 rounded-sm border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {projectLookupError}
          </div>
        ) : null}

        {loadedProject ? (
          <div className="mb-8 rounded-sm border border-border bg-accent/30 p-4 text-sm text-muted-foreground">
            Connected client project:{" "}
            <strong className="font-semibold text-foreground">
              {loadedProject.name}
            </strong>{" "}
            ({loadedProject.trackedDomain}).
          </div>
        ) : null}

        <div className="mb-8 max-w-2xl">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            {loadedProject ? "Client report" : "Report prototype"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            AI visibility report
          </h1>
          <p className="mt-4 text-muted-foreground">
            {loadedProject
              ? `Follow ${loadedProject.name}’s presence in AI-generated answers from original observations to the evidence-backed actions they support.`
              : "Follow a company’s presence from the original answers to the actions they support. This prototype shows the report structure; no company or observations have been added."}
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
            { id: "monitoring", label: "Monitoring" },
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
                <dd className="mt-1 font-medium">{companyName}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  Website/domain
                </dt>
                <dd className="mt-1">{companyDomain}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Report date</dt>
                <dd className="mt-1">{reportDate}</dd>
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
            {scanQueries.length > 0 ? (
              <>
                <p className="mt-2 text-muted-foreground">
                  Synthesized {scanQueries.length} buyer-intent queries for{" "}
                  {companyName} (
                  {latestScan?.prompt_method_version ?? "niche-prompts-v1"}).
                </p>
                <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                  {scanQueries.map((query) => (
                    <div
                      key={query.query_ordinal}
                      className="rounded-sm border border-border bg-background p-4"
                    >
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono">
                        Query #{query.query_ordinal + 1} • {query.query_version}
                      </dt>
                      <dd className="mt-2 font-medium text-foreground text-sm">
                        {query.query_text}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <>
                <p className="mt-2 text-muted-foreground">
                  Query templates only. None have been executed.
                </p>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Bracketed terms need the company’s actual category, buyers,
                  and competitors before questions can be selected.
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
              </>
            )}
          </section>

          <section
            id="observations"
            aria-labelledby="observations-title"
            className="scroll-mt-6 py-8"
          >
            <h2 id="observations-title" className="text-xl font-semibold">
              Raw observations
            </h2>
            {rawObservations.length > 0 ? (
              <>
                <p className="mt-2 text-muted-foreground">
                  Collected {rawObservations.length} raw AI provider
                  observations with cryptographic evidence digests.
                </p>
                <div className="mt-6 overflow-x-auto rounded-md border border-border">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th className="p-3 font-medium">#</th>
                        <th className="p-3 font-medium">Observation ID</th>
                        <th className="p-3 font-medium">Provider / Model</th>
                        <th className="p-3 font-medium">Outcome</th>
                        <th className="p-3 font-medium">Response Digest</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rawObservations.map((obs) => (
                        <tr
                          key={obs.observation_id}
                          className="hover:bg-muted/40 transition-colors"
                        >
                          <td className="p-3 font-mono">
                            {obs.query_ordinal + 1}
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">
                            {obs.observation_id.slice(0, 8)}…
                          </td>
                          <td className="p-3">
                            {obs.provider} ({obs.requested_model})
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex rounded-xs border px-1.5 py-0.5 font-medium ${
                                obs.outcome === "answered"
                                  ? "border-success/20 bg-success/10 text-success"
                                  : "border-destructive/20 bg-destructive/10 text-destructive"
                              }`}
                            >
                              {obs.outcome}{" "}
                              {obs.failure_code ? `(${obs.failure_code})` : ""}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">
                            {obs.response_digest
                              ? `${obs.response_digest.slice(0, 18)}…`
                              : "None"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 font-medium">
                  No observations collected yet.
                </p>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  The exact answer will appear here with its query, provider,
                  model when disclosed, observation ID, and capture time. No AI
                  queries have been run for this report.
                </p>
              </>
            )}
          </section>

          <section
            id="citations"
            aria-labelledby="citations-title"
            className="scroll-mt-6 py-8"
          >
            <h2 id="citations-title" className="text-xl font-semibold">
              Citations and evidence
            </h2>
            <p className="mt-4 font-medium">No citations recorded yet.</p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Each returned source will link to its observation, original URL,
              source domain, capture time, and relationship to the answer. A
              citation alone does not prove that a source supports a claim.
            </p>
          </section>

          <section
            id="interpretation"
            aria-labelledby="interpretation-title"
            className="scroll-mt-6 py-8"
          >
            <h2 id="interpretation-title" className="text-xl font-semibold">
              Interpretation
            </h2>
            <p className="mt-4 font-medium">
              No interpretations available yet.
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Brand mentions, positive recommendations, competitor mentions, and
              source associations will point to supporting answer excerpts.
              Ambiguous context will remain labeled as uncertain.
            </p>
          </section>
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
            {loadedProject ? (
              <div className="mt-4">
                <CustomerActionsPanel
                  projectName={loadedProject.name}
                  actions={[]}
                />
              </div>
            ) : (
              <>
                <p className="mt-4 font-medium">
                  No evidence-based actions available yet.
                </p>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Each action will identify its reason, target, expected impact,
                  effort, priority, and supporting evidence. Impact will be an
                  explained hypothesis, not a promised ranking improvement.
                </p>
              </>
            )}
          </section>
          <section
            id="monitoring"
            aria-labelledby="monitoring-title"
            className="scroll-mt-6 py-8"
          >
            <h2 id="monitoring-title" className="text-xl font-semibold">
              Historical scan comparison & monitoring
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Monitor visibility trends and query movement between successive
              scans. Comparisons strictly enforce matching project scope,
              tracked domain, and methodology versions.
            </p>
            <div className="mt-6">
              <ScanComparisonPanel
                projectName={companyName}
                comparisonReport={null}
              />
            </div>
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
