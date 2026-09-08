# Architecture

## Current implementation

One Next.js App Router application. `src/app/page.tsx` renders static preview content and links to the static report prototype at `src/app/report/page.tsx`; `layout.tsx` sets metadata/language; `globals.css` owns design tokens. `next.config.ts` provides baseline response headers. Browser tests in `tests/e2e` exercise the production build. No route invokes network access or server state.

The standalone domain intake slice below adds reusable URL rules and an explicitly invoked DNS preflight. It is not connected to a route or UI and performs no HTTP requests.

The Firecrawl foundation in ADR-008 adds a crawler contract and a server-only request/response adapter, exercised with mocked transport. There is no enabled live crawler or scanner.

## ADR-001: small application with explicit boundaries

Status: accepted for this foundation. Date: 2026-09-07. Decision basis: user foundation brief and empty repository; assumptions in [product-scope.md](docs/product-scope.md).

Choose Next.js + React + TypeScript + Tailwind with npm. A static HTML-only project would be smaller today but would not establish the requested application toolchain. A monorepo with separate backend, queue, and component library adds coordination before real boundaries exist. Keep one deployable app until measured needs justify separation.

Keep native markup for the current page. Official shadcn is the preferred future component source, not a dependency installed for hypothetical dialogs. Use a conservative TypeScript 5.9 compiler supported by the framework rather than introducing the newly released major compiler during foundation work. Exact versions and lockfile define the toolchain; upgrade through reviewed changes.

ESLint is pinned to 9.39.5: Next.js 16.3.4's bundled React/import/a11y plugins do not support ESLint 10; the tested 10.10.0 upgrade failed with `contextOrFilename.getFilename is not a function`. ESLint 9 now carries an upstream support/deprecation warning. This is a documented development-tool limitation, not a suppressed check. Revisit when the Next.js lint preset updates those plugins; do not force incompatible peers or disable rules to upgrade.

When functionality exists, use this dependency direction:

```text
src/app (UI / request boundary)
    -> src/application (use-case orchestration)
        -> src/domain (pure rules and explicit types)
        -> src/infrastructure (DB / provider / job adapters)
```

Domain never imports UI, SDKs, or infrastructure. Request boundaries authenticate/validate, call one use case, and map safe results to HTTP/UI. External responses start as `unknown`. Introduce a narrow provider contract with the first integration because fault injection, normalization, and substitution are concrete needs; no general-purpose adapter framework. Keep SDK types inside the adapter.

Application orchestration owns authorization, idempotency, transactions, entitlements, usage reservations, and coordination. Client components receive minimum serializable data. Server-only modules use `import "server-only"`. Do not cache authenticated results across tenants; cache keys include tenant/project and evidence/method versions. No client global store until real state requires one.

Create these future directories only when they hold implementation. No repositories for every table, DI containers, generic base service, or empty interface files.

## ADR-002: persist only the next authenticated slice

Status: proposed pending V1 validation. Use Supabase Auth, PostgreSQL, migrations and RLS. No ORM or parallel auth provider. Compare with custom auth/Postgres: Supabase fits the stated preference and reduces initial credential/session infrastructure; tradeoff is learning its grants, session, and RLS boundaries. No migration in this phase because the shell has nothing to persist.

See [database-foundation.md](docs/database-foundation.md) for entities and tenant constraints; [SECURITY.md](SECURITY.md) for required tests. Revisit tenancy before client sharing or agency-to-agency data transfer.

## ADR-003: durable work without premature queue infrastructure

Status: proposed for the first scanner. Durable Postgres job rows plus one bounded worker are the initial candidate. A synchronous web request cannot safely own retries and paid provider execution. A distributed broker is unnecessary without throughput evidence. The worker runtime depends on the eventual host; do not implement `setTimeout` or unawaited promises as a queue.

See [scanning-architecture.md](docs/scanning-architecture.md). Revisit for measured claim contention, scheduler delay, or runtime limits. No provider SDK, broker, scheduler, billing service, or observability vendor is installed.

## ADR-004: report contract before the data pipeline

Status: accepted for the user's explicit Task 03 instruction. The user reports initial agency validation complete and authorizes a report specification/prototype before authentication, scanner, and intelligence implementation. Individual Task 02 interview/pilot findings remain undocumented; this decision does not invent those findings or mark the research record Done.

This is a bounded exception to implementing Levels 1–4 in order: define the output before automating its production. Use one static `/report` route with explicit empty states and documented future record/metric contracts in [report-specification.md](docs/report-specification.md). A populated dashboard, generic report engine, new dependencies, and speculative data-layer code are unnecessary. There is no untrusted input or stored client information, so existing static security boundaries apply. Add validation, tenant protection, provider controls, metric tests, and stricter CSP when the respective real surfaces are implemented. This task does not authorize those integrations or Task 04.

## ADR-005: database preparation before application tables

Status: accepted for the user's bounded connection-check and database-foundation request on 2026-09-08. Level: Level 1 preparation only. Deliverable: a safe connection check, an accurate access record, and an executable preparation checklist in [database-foundation.md](docs/database-foundation.md). Acceptance: distinguish endpoint reachability from authenticated SQL access; document migration and tenant-security prerequisites; create no application tables or other remote database objects. Stop after reporting the result, including any unavailable verification.

This permits preparatory documentation before the first authenticated slice, not a change to its authentication → workspace → membership → projects → security sequence. The validation documentation gaps in ADR-004 remain. A live SQL check is blocked in this agent session because Supabase tools and authenticated alternative connections are unavailable. Local documentation can be prepared independently; database initialization, hosted linking, SDK/CLI installation, migrations, grants, policies, and generated types are deferred. Reuse the existing database contract rather than add an empty migration or speculative infrastructure.

## ADR-006: core tenant migration, pending database verification

Status: authorized by the user's subsequent core-table implementation request on 2026-09-08; local draft, not deployed. Level 1 database slice only. This supersedes ADR-005's preparation-only stop boundary for this task. Define profiles referencing Supabase Auth users, workspaces, workspace memberships, and projects. Do not implement auth UI or later product levels. This database-first slice precedes the authentication UI so grants and isolation can be reviewed together; the earlier validation documentation gaps remain.

Use the pinned Supabase CLI to generate the local migration and pgTAP test file. No extra database engine, SDK, ORM, or application adapter is needed. Supabase MCP remains unavailable to this agent and Docker is unavailable locally; applying the migration, replaying it, generating database types, and passing actual RLS tests are unresolved acceptance criteria. Do not deploy this draft until those checks pass and the existing hosted schema/migration history is inspected.

Clients may create/update their own profile, read their own memberships, rename workspaces they own, and manage projects in workspaces they belong to. A narrow workspace-creation RPC atomically inserts the workspace and first owner, deriving identity from `auth.uid()`. The privileged implementation stays in an unexposed private schema with a fixed search path; its public wrapper is invoker-only. Clients cannot directly create/delete workspaces or insert/update/delete memberships. Invitations, peer membership browsing, role transfer, and workspace deletion are separate tasks; denying those writes prevents self-promotion and removal of the last owner through the client API. Existing members are checked from database rows, never editable JWT metadata. Project identity, tenant, creator, and timestamps are immutable to client writes through column grants. A revoked membership loses policy access immediately, including to projects it originally created.

## ADR-007: standalone domain intake before the scanner

Status: authorized by the user's domain-intake-only request on 2026-09-08. Level 2 preparation, explicitly ahead of the unfinished Level 1 database/authentication prerequisites because pure input rules and DNS target screening can be implemented independently. This does not complete Level 1 or authorize crawling, Firecrawl, paid calls, auth, billing, database changes, or UI changes. Stop after implementing the layer, security tests, and the four requested verification commands; do not commit.

Use the native WHATWG URL parser for website normalization and Node's `net.isIP`/`BlockList` for IP classification. No new dependency. Pure rules live in `src/domain`; DNS orchestration in `src/application`; native DNS access in `src/infrastructure`. Node's built-in test runner executes TypeScript tests through type stripping; `allowImportingTsExtensions` supports their explicit imports under the existing `noEmit` configuration.

Accept bare DNS names or HTTP(S) URLs, trim outer spaces, lowercase/ASCII-encode internationalized hostnames, remove one trailing DNS dot, preserve exact subdomains including `www`, and return an HTTPS origin without path/query/fragment. Permit only an omitted port or the input scheme's default port (bare names use HTTPS). Reject credentials including empty userinfo, control/format characters, backslashes, encoded authorities, malformed hostnames, special/internal names, and all IP-literal website inputs, including public literals. This conservative DNS-name-only intake fits client-brand domains; it does not infer ownership, a registrable domain, or www/apex equivalence. Preserve original website evidence separately when persistence is implemented; this normalizer is not a citation sanitizer.

Syntax acceptance is not network authorization. DNS preflight must inspect every returned IPv4/IPv6 address, reject mixed public/private results, empty/malformed/oversized responses and DNS failures, and enforce cancellation and a three-second deadline. Native DNS queries both A and AAAA with bounded attempts and cancels pending work. Public address classification conservatively excludes IANA special-use ranges, multicast, transition mechanisms, and Azure's platform virtual IP. IPv6 is limited to ordinary global unicast outside special assignments.

The result is a DNS snapshot with explicit addresses, never a reusable fetch permission. A future transport must pin one of those exact addresses at connection time while preserving hostname TLS/SNI verification, reject implicit proxy/second-resolution paths, and repeat validation for every redirect/retry. No transport, HTTP request, redirect follower, or public intake endpoint exists in this task. Deployment-specific egress rules must also reject any organization-private routes inside otherwise public ranges. See SECURITY.md for sources and integration limits.

## ADR-008: Firecrawl adapter foundation with live execution closed

Status: authorized by the user's crawler-boundary-only request on 2026-09-08. Level 2 preparation ahead of unfinished Level 1 authentication/database and scan usage prerequisites. Deliver a small application crawler interface, Firecrawl infrastructure adapter, credential validation, normalized provider results, and mocked tests. Do not implement scanning orchestration, Supabase integration, extraction, AI, metrics, UI, authentication, billing, or persistence; no commit. Stop after the four requested checks and handoff.

Scope is one entry page through Firecrawl v2 `/scrape`, explicitly declared by the adapter's capabilities. This avoids remote crawl jobs, polling, pagination, cancellation of paid background jobs, and unbounded link discovery in a boundary-only task. Request markdown with TLS verification enabled, no browser actions or LLM formats, no cache writes, no PDF parsing, and a finite provider timeout. Use native request/response types; no Firecrawl SDK. Install only exact `server-only@0.0.1` with scripts disabled to guard the first credential-bearing module. Unit tests use Node's `react-server` condition; a separate import test confirms the default condition rejects server-only modules.

The website-target layer now issues frozen, privately branded targets registered by object identity. The crawler accepts only those in-process results, rejecting raw URLs, copied/serialized/forged objects, or mutated targets. This is provenance of screening, not a durable permission or proof that DNS cannot change. No DNS validation is removed.

Firecrawl's hosted API accepts URLs and does not expose our screened IPs as transport destinations. Sending an origin to that API would not satisfy ADR-007's connection pinning and redirect requirements. Therefore the adapter has no default HTTP implementation: it returns `live_crawl_unavailable`. A narrow injected exchange supports isolated tests and later integration with an independently reviewed transport that enforces target freshness, destination/redirect/egress policy, and caller authorization/usage reservations. There is no environment toggle, alternative provider URL, or default `fetch` path that bypasses this restriction. An API key alone cannot enable a real crawl. Do not claim that checking returned URLs prevents a request Firecrawl already made.

The adapter builds a fixed API request, caps each response at 2 MiB and the whole attempt at 20 seconds, propagates cancellation through request/body reads, normalizes HTTP/provider errors without raw payloads, and performs no retries. A per-instance busy guard bounds concurrent work. Results contain only provider-reported URL/source URL, optional title/description/language/status, and markdown; absent fields are null. Missing content is empty, malformed fields fail closed, external/unsafe reported URLs are rejected, and arbitrary metadata/HTML/provider diagnostics are discarded. No fabricated crawl timestamps, complete-site claim, inferred company, or extracted intelligence.
