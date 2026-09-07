# Architecture

## Current implementation

One Next.js App Router application. `src/app/page.tsx` renders static preview content and links to the static report prototype at `src/app/report/page.tsx`; `layout.tsx` sets metadata/language; `globals.css` owns design tokens. `next.config.ts` provides baseline response headers. Browser tests in `tests/e2e` exercise the production build. No network data path or server state exists.

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
