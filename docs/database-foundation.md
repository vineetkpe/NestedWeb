# Database foundation (local migration draft; not deployed)

Supabase Auth + PostgreSQL + RLS is the intended boundary. The workspace MCP configuration points to existing project `ckekmlrybsztcplqaipu`; this task did not create that project or an account. The subsequent core-table task now has a pinned Supabase CLI, local configuration, one migration draft, and a pgTAP suite. No migration has been applied or database security verified. The app remains static with no database SDK, auth flow, or persistence integration.

## Core-table implementation status — 2026-09-08

Level 1 database slice, authorized in [ADR-006](../ARCHITECTURE.md#adr-006-core-tenant-migration-pending-database-verification). This supersedes the earlier preparation-only stop condition below. The [implementation plan](superpowers/plans/2026-09-08-core-tenancy.md) tracks the remaining acceptance criteria.

- `supabase/migrations/20260908032249_core_tenancy.sql` drafts profiles, workspaces, workspace memberships, and projects, with constraints, indexes, explicit column grants, RLS, timestamp triggers, and atomic workspace/owner creation.
- Profiles are self-only. Membership reads are self-only; all client membership writes are denied. Workspace creation uses `public.create_workspace(text)`; owners may rename their workspaces. Members may create/read/update/delete their workspace's projects. Project identity, tenant, creator, and timestamps cannot be rewritten by clients. Invitations, owner transfer, and workspace deletion remain separate tasks.
- Domains must already be lowercase DNS hostnames with at least two labels and no scheme, path, port, or trailing dot. Internationalized domains require ASCII encoding before insertion. This is a storage format check, not domain ownership, public-suffix, network-safety, or crawl authorization validation. No network requests are implemented.
- `supabase/tests/core_tenancy_test.sql` contains test-only fixtures and actual `anon`/`authenticated` role assertions. It covers cross-tenant CRUD, revocation, self-promotion, immutable fields, profile ownership, ignored editable metadata, function grants, and rollback when the second bootstrap insert fails. Privileged queries only arrange fixtures or confirm stored state; they do not establish client access.
- CLI `2.117.0` is installed and runnable. The generated local configuration selects Postgres 17; compatibility with the hosted version is still unverified. Anonymous sign-ins are disabled locally and must remain disabled for this slice on the target project.
- The resumed `supabase test db --local` attempt failed with `ECONNREFUSED` at `127.0.0.1:54322`, before executing SQL assertions. Docker and `psql` are unavailable on PATH; the standard Docker Desktop executable is absent. No callable Supabase connector or configured database environment variables are available to this session. Hosted schema/history, migration replay, SQL lint/advisors, generated types, and passing RLS tests remain pending.

Run `npm run test:db` only after the migration has been replayed in the disposable local Supabase database. The application `npm run verify` suite does not execute database tests. Do not apply this draft to the hosted project until isolated verification passes and its environment, version, existing schema, and migration history have been inspected. No hosted reset is authorized.

## Preparation scope and verification record — 2026-09-08

Level 1 preparation only, authorized in [ADR-005](../ARCHITECTURE.md#adr-005-database-preparation-before-application-tables). Deliverables are this connection procedure and the existing tenant/migration contract below. Successful authenticated SQL execution remains an unmet acceptance criterion; documentation preparation does not imply a running database foundation or Level 1 completion.

| Check                       | Observed result                                                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace configuration     | `.vscode/mcp.json` contains the requested HTTP server and project reference; existing user edits were preserved.                                                                                                                                |
| VS Code connection evidence | Its logs recorded successful OAuth token exchange at 08:27:26 IST and discovery of 20 tools at 08:27:27 IST. This is earlier client evidence, not a database query result.                                                                      |
| Fresh endpoint check        | At 03:02:29 UTC, an unauthenticated MCP `initialize` request scoped to this project with `read_only=true` returned HTTP 401 and an authentication challenge. The endpoint is reachable; this request was not authenticated and executed no SQL. |
| Agent access                | No callable Supabase tools, configured Supabase/database environment credentials, installed Supabase/Postgres CLI, or connected browser were available. VS Code's stored OAuth credentials were not extracted.                                  |
| Database state              | Unverified: database version, existing objects, grants, RLS, migrations, and project environment designation were not inspected. Do not assume the hosted project is empty.                                                                     |

## Safe authenticated connection check

In the client that owns the authenticated Supabase connection, select project `ckekmlrybsztcplqaipu` and execute the following as one request in a fresh SQL session. For MCP, use `execute_sql`, never `apply_migration`. Restrict the check's connection to `read_only=true`; the SQL also explicitly starts a read-only transaction. See [Supabase MCP configuration](https://supabase.com/docs/guides/ai-tools/mcp) and [PostgreSQL transaction access modes](https://www.postgresql.org/docs/current/sql-set-transaction.html).

```sql
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';

select
  1 as connection_ok,
  current_setting('transaction_read_only') as transaction_read_only,
  current_setting('server_version') as server_version;

rollback;
```

Pass only when the SELECT result is actually returned with `connection_ok = 1`, `transaction_read_only = 'on'`, and the observed server version. Record the client, confirmed project reference, check time in UTC, and returned values. The version is unknown until execution; no expected version is invented. This checks SQL connectivity without reading customer rows or creating objects. It does not test tenant isolation or application-role permissions. If execution fails inside a persistent session, run `rollback` there before reusing it. Do not substitute an unauthenticated HTTP response or cached tool list for this result.

## Foundation readiness checklist

This checklist records the earlier preparation task. CLI installation and draft creation have since been authorized and completed locally; execution and hosted prerequisites remain open as recorded above:

1. Complete the authenticated check above. Confirm the hosted project's development/staging/production designation before linking or changing it. Inspect existing schema and migration metadata read-only; reconcile any existing objects rather than overwrite them.
2. Review the current official CLI release and install an exact version as a development dependency with a lockfile. Inspect its installation scripts under the repository's `ignore-scripts=true` policy. Discover supported commands through `--help`; use the [official CLI setup guide](https://supabase.com/docs/guides/local-development/cli/getting-started). Docker was not available on PATH during this check and local database startup was not attempted.
3. Initialize local configuration with that reviewed CLI. Keep machine-local linkage/cache and credentials ignored. Do not commit a database password, access token, service key, or generated credential output. Select a local Postgres major version compatible with the observed hosted version. Do not link to the hosted project or reset it as part of initialization.
4. Preserve the imperative migration workflow below. Create the first named migration only with a real, authorized feature; include constraints, least-privilege grants, RLS policies, and anonymous/member/nonmember/two-tenant allow/deny tests together. No empty baseline migration or placeholder tables.
5. Replay migrations only against an explicitly disposable local database, run the actual database tests, and generate types from that verified schema. Complete application verification and dependency audit. Review hosted rollout separately using OPERATIONS.md; this preparation does not authorize deployment.

Historical preparation stop condition (superseded for the four-table local draft by ADR-006): report the connection limitation and prepared contract without creating database objects. Auth flows and later product features remain outside the current task.

## First authenticated slice

| Entity     | Minimum shape and integrity                                                                                                                                        | Access                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| workspace  | UUID primary key, name, creator auth-user FK, created/updated `timestamptz`                                                                                        | Active members read; owner administers                                       |
| membership | workspace FK + auth-user FK composite PK, constrained role, timestamps                                                                                             | Members see only permitted membership data; owners manage; no self-promotion |
| project    | UUID PK, workspace FK, name, normalized tracked domain, creator FK, timestamps; unique `(workspace_id, id)` and domain uniqueness if validated product requires it | Workspace members within their actual role                                   |

Proposed roles: owner administers membership; member works on projects. These are a minimum proposal, not an approved full agency permission matrix. Client/viewer roles and invitations require separate requirements. Workspace creation and initial owner membership must be atomic; direct public table writes cannot grant arbitrary membership. Avoid recursive membership policies; any necessary definer helper must be narrow, private-schema, fixed search path, minimum execution grant, and explicitly tested. Preserve a last owner; define transfer/deletion rules before exposing those actions.

## First observation slice, after validation

Proposed additions only: versioned tracked query, scan run, bounded scan attempt, immutable raw observation, versioned interpretation, and citation rows. A scan binds workspace/project and immutable query/model configuration. Observation points to attempt; interpretation points to observation/parser version; citations point to interpretation and preserve provider offsets/URLs. Raw heterogeneous payloads may use JSONB or private object storage with a digest and schema version; structured tenant/query/state/cost/citation fields remain relational.

Provider/model identity can initially be versioned configuration fields; no provider catalog table until needed. Mentions may be structured interpretation data until queries require rows. Metrics can be deterministic queries over eligible interpretations, not a new aggregate table by default. Recommendations/reports/competitors/billing tables wait for a real feature.

## Constraints to implement with each table

- Tenant-owned rows carry `workspace_id`. Parent joins use composite `(workspace_id, parent_id)` foreign keys against corresponding unique constraints, preventing cross-tenant references even for privileged workers.
- RLS enabled for exposed tables, anonymous grants revoked by default, least authenticated grants, `USING` and `WITH CHECK` predicates match membership and role. Block moving rows between tenants. A user supplied project ID is never authorization.
- All keys/FKs, state checks, required timestamps and uniqueness constraints belong in migrations. Index membership lookups, project list `(workspace_id, created_at)`, later job claim `(state, next_attempt_at)`, and observation evidence queries when those access patterns exist. Measure before adding indexes.
- Worker-written immutable evidence is not client-writable. Keep raw prompts and provider data private. Retention/deletion must remove derived evidence consistently and preserve only allowed audit/usage metadata.
- Views/functions need explicit privilege and RLS review. No service-role key in request-facing user clients. Generate DB types after migration and check them in; domain types remain independent of generated SDK records.

## Migration workflow at implementation time

Pin a current Supabase CLI after reviewing its help/docs; local development uses Docker. Initialize locally, create a named migration, review SQL, reset/replay only an explicitly disposable local DB, run `supabase test db` for anonymous and two authenticated tenants, then regenerate types. Never run reset against a remote DB. Never mutate a live schema silently from an agent skill. Hosted rollout uses reviewed migrations and backup/rollback planning in OPERATIONS.md.
