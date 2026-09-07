# Product scope and assumptions

## Repository inspection — 2026-09-07

The original repository had an unborn `main` branch and only an untracked `.vscode/mcp.json` defining a Notion HTTP MCP server. No framework, package manager, TypeScript configuration, UI kit, database, auth, APIs, environment files, tests, lint, CI, docs, agent instructions, project skills, or design system existed. No separate AI Visibility OS product plan was found in the repository or supplied context. The configured Notion server was not an available callable connector in this session; no remote product plan was retrieved or inferred.

The user's supplied [foundation brief](foundation-brief.md) is preserved verbatim and is the current product source. It establishes agency-first B2B AI visibility/GEO monitoring, citations, mentions, competitive visibility, and evidence-backed recommendations. It is not a detailed V1 specification.

## Decisions for this phase

- A runnable Next.js/React/TypeScript/Tailwind shell provides a usable development/verification foundation. npm fits the installed toolchain; no monorepo is justified.
- One preview route explains the proposed evidence method and explicitly has no observations. No invented dashboard or routes.
- Supabase Auth/Postgres/RLS is the intended persistence boundary from the brief. No credentials, SDK, remote project, schema, or migrations are needed before a real authenticated slice.
- One grounded provider path is the next data milestone; provider, model, query set, geographic scope, pricing, hosting, retention, and operational service targets remain undecided. Never infer a provider from available personal credentials.
- An agency workspace is the proposed tenant, with projects for client brands. Client access and cross-agency sharing are not defined and are deferred.
- Primary design is light, calm, dense, and evidence-oriented. Airtable is a structural reference, not a brand to reproduce.

## Smallest next implementation phase

First validate the core workflow with an agency and capture the missing V1 decisions. Then implement one authenticated workspace and project creation/listing slice using Supabase Auth. Include migrations for workspace/membership/project only, ownership checks, tenant RLS, unauthorized and cross-tenant tests, real empty/error states, and generated DB types. No scanner yet.

Acceptance: signed-out access is denied; a member can create/list projects only in their workspace; editing URL/body IDs cannot cross tenant boundaries; revoked membership stops access; no service key reaches the client. Membership bootstrap must be transactional and not allow self-promotion.

After that slice, select one supported grounded provider and a bounded query cohort, record one raw observation with citations, and show its evidence before implementing aggregate metrics. [Database](database-foundation.md), [scanning](scanning-architecture.md), and [methodology](data-methodology.md) describe proposed constraints, not completed infrastructure.
