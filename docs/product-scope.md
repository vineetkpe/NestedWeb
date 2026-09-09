# AI Visibility OS product scope and success criteria

## Product contract — Task 01

Primary ICP: **SEO/GEO agencies serving B2B SaaS clients.**

Core promise:

> Measure how a business appears in AI-generated answers, explain the observed competitive/citation landscape using evidence, and turn those observations into specific actions.

Core workflow: **Measure → Explain → Recommend → Monitor**. The product is not simply a visibility score. Every important result must be traceable to underlying evidence and a versioned method; the customer must be able to understand the result and choose a specific next action.

The user's Task 01 instruction locks these product boundaries and the execution sequence below. The earlier [foundation brief](foundation-brief.md) remains the engineering foundation source. Detailed implementation choices remain open where explicitly listed; they do not authorize scope expansion.

## Repository inspection — 2026-09-07

The original repository had an unborn `main` branch and only an untracked `.vscode/mcp.json` defining a Notion HTTP MCP server. No framework, package manager, TypeScript configuration, UI kit, database, auth, APIs, environment files, tests, lint, CI, docs, agent instructions, project skills, or design system existed. No separate AI Visibility OS product plan was found in the repository or supplied context. The configured Notion server was not an available callable connector in this session; no remote product plan was retrieved or inferred.

The original foundation brief is preserved verbatim. The absence of a detailed product plan above describes the initial inspection; Task 01 now supplies the V1 boundaries in this document.

## Current implementation, checked against code

- `src/app/page.tsx` is a static preview with an honest empty observation state and methodology explanation. It links to `src/app/report/page.tsx`, a static report prototype with empty evidence/metric/action states and unexecuted query templates. `layout.tsx` supplies metadata; `globals.css` supplies semantic design tokens. No dashboard or route-connected data flow exists.
- `next.config.ts` sets baseline response headers. npm scripts provide formatting, lint, strict types, build, Node unit/security tests, and Playwright checks. Five browser tests run on desktop/mobile Chromium, including report navigation, keyboard, axe, empty-state, header, and 404 checks.
- Next.js/React/TypeScript/Tailwind, GitHub CI, engineering contracts, and reviewed skills under `.agents/skills` already exist. There is no separate `skills/` directory to recreate.
- Standalone website intake/DNS preflight, a Firecrawl contract and mocked adapter with live execution closed, and evidence-backed CompanyProfile extraction from supplied crawl results exist. These modules do not collect live data or populate the UI. See ADR-007–009 for the authorized Level 2 preparation exceptions.
- Local Supabase migration and pgTAP files draft profiles, workspaces, memberships, and projects; application integration, migration deployment, and passing database verification remain pending (ADR-006). Authentication, live crawling/provider execution, scans, metrics, billing, and deployment remain future work. Neither Level 1 nor Level 2 exit criteria are complete.

Task 01 changes documentation only. It does not implement Supabase, auth, database, scanner, Firecrawl, Gemini or other APIs, AI calls, dashboard, billing (including Stripe/Razorpay), background jobs, or new product functionality. Keep the preview working and free of fabricated customer data.

## V1 boundaries

V1 eventually needs all of the following, delivered through separate small tasks in the sequence below:

- User authentication, workspace, and projects/client brands.
- Website/domain input, website crawling, and a structured company profile.
- Relevant buyer-intent prompts and initially one grounded AI/search provider.
- Raw AI observations and real citations/sources.
- Brand mention detection, recommendation detection, and competitor detection.
- Auditable visibility metrics and evidence-based recommendations.
- Dashboard and historical scans.
- Usage/cost limits and basic paid plans.
- Production deployment.

Explicitly outside V1:

- Custom LLM or GPU infrastructure.
- Dozens of AI providers or a huge enterprise feature set.
- A white-label agency platform before core validation.
- Automated ranking guarantees or unlimited scans.
- Generic AI content generation or fully automated SEO implementation.
- Complex workflow automation.
- Features that do not change the customer's next action.

An agency workspace is the intended tenant, with projects representing client brands. Client access, invitations, detailed roles, and cross-agency sharing require their own validated scope; they are not implied by workspace support. Basic agency expansion at Level 5 does not override the exclusions above. Reports at Level 4 should communicate the existing evidence and actions, not introduce an enterprise report builder.

## Evidence contract

Keep **raw observation → normalized interpretation → metric → recommendation** separate. Exact response/query/provider/model/time/citations are raw evidence; detected mentions, endorsements, competitors, and citation associations are interpretations; rates/shares/accuracy/trends are calculations; proposed customer actions are recommendations. Each derived layer links to its inputs and method version. Detecting that an AI answer recommends a brand is distinct from this product recommending an action to the agency.

[Data methodology](data-methodology.md) defines the provenance, examples, calculation gates, missing-data behavior, and limits. Never invent observations, citations, metrics, or supporting evidence to populate a screen. A missing result is unavailable, not an invented zero or score.

## Development sequence and level exit criteria

Follow Levels 0–6 in order. Each future task must name its level, bounded deliverable, acceptance criteria, and stop condition. Record any justified order change and affected prerequisites in [ARCHITECTURE.md](../ARCHITECTURE.md) before implementing it. A listed capability is not permission to start the next task automatically.

| Level            | Required sequence                                                                                               | Evidence required to exit the level                                                                                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Validation   | Validate the agency workflow and customer willingness to pay.                                                   | Recorded real agency feedback on the workflow, the next action it enables, and willingness to pay; an explicit proceed/revise/stop decision with evidence and unresolved objections. No validation result is assumed.                                                                                                     |
| 1 — Foundation   | Authentication → workspace → membership → projects → security.                                                  | A signed-in member can create/list projects only in their workspace; signed-out/nonmember access, altered tenant IDs, self-promotion, and revoked membership are denied. Bootstrap is transactional; migrations, grants, RLS, and allow/deny tests agree.                                                                 |
| 2 — Scanner      | Domain → crawling → company profile → prompt library → scan jobs → raw observations → one grounded AI provider. | A bounded end-to-end run preserves crawl/profile provenance, versioned buyer-intent queries, and exact responses/citations from one real grounded provider. Failures, retries, usage, and partial collection are explicit. Designing observation storage before the provider adapter does not mean fabricating responses. |
| 3 — Intelligence | Citations → normalization → mentions → recommendations → competitors → metrics → recommendations.               | Detection (including brand recommendation detection) traces to response spans; calculations expose cohorts, formulas, denominators, and exclusions; customer action recommendations cite supporting evidence and limitations. The final recommendations step is action generation, distinct from detection.               |
| 4 — Product      | Dashboard → queries/evidence → competitors → recommendations → history → reports.                               | An agency can inspect real results and underlying evidence, choose an action, and compare compatible historical scans. UI has accessible empty/error/partial states and preserves workspace/project context.                                                                                                              |
| 5 — Monetization | Usage accounting → limits → plans → billing → agency expansion.                                                 | Usage and paid entitlements are enforced server-side; exhausted limits and concurrent/replayed operations cannot bypass controls; basic paid-plan changes and billing events are tested.                                                                                                                                  |
| 6 — Production   | Observability → security testing → performance → deployment → final QA.                                         | Operational signals, tenant/security tests, measured performance against agreed budgets, deployment checks, recovery procedures, and final QA have recorded results for the release.                                                                                                                                      |

Security, accessibility, observability needed to diagnose a feature, and cost controls apply when a surface is first introduced. Level 5 completes monetization; **authentication, authorization, atomic usage/cost reservation, and bounded calls must exist before any paid crawling/provider execution at Level 2**. Level 6 validates release readiness; it does not postpone earlier security gates. Follow [SECURITY.md](../SECURITY.md), [scanning architecture](scanning-architecture.md), and [OPERATIONS.md](../OPERATIONS.md).

## V1 success criteria and unresolved decisions

V1 succeeds when an agency can complete Measure → Explain → Recommend → Monitor for a real B2B SaaS client: inspect sampled answers and sources, understand detected competitors/citations and metric calculations, choose a supported specific action, then revisit compatible historical evidence. All V1 capabilities above must meet their level exit criteria and the [task Definition of Done](../AGENTS.md#definition-of-done). Rising visibility or guaranteed ranking is not an acceptance criterion.

The user reported initial agency validation complete when authorizing Task 03 (ADR-004), but the underlying interview/pilot findings and willingness-to-pay evidence remain undocumented. No interview count, conversion target, price, or customer outcome is invented here. Level 0's evidence record remains incomplete; subsequent bounded sequencing exceptions are recorded in ARCHITECTURE.md.

Before the relevant implementation task, explicitly resolve provider/model, crawl scope and budget, query cohort/locale, profile review, retention/sharing, metric definitions and uncertainty, plan pricing/limits, hosting, and operational/performance targets. These are bounded implementation decisions, not permission to add new V1 features. Never infer a provider or deployment target from available personal credentials. The [database](database-foundation.md) document records local drafts and outstanding verification; [scanning architecture](scanning-architecture.md) specifies future orchestration around the existing standalone modules.

## Task 01 stop condition

Repository inspected; product scope, V1 boundaries, evidence model, development order, and task Definition of Done documented; existing app still works; required verification passes. Then stop without implementing product functionality or starting Task 02.

Task 01 handoff: **Task 02 — Validate agency workflow manually**. The user subsequently authorized **Task 03 — Create the First Real AI Visibility Report**, limited to a report specification and empty working prototype. See [report specification](report-specification.md) and [ADR-004](../ARCHITECTURE.md#adr-004-report-contract-before-the-data-pipeline) for the explicit sequencing exception; the interview documentation gaps remain recorded, not filled with assumed findings. Task 04 is not authorized.
