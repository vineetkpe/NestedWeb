# Database foundation (proposed; no migrations)

Supabase Auth + PostgreSQL + RLS is the intended boundary. No database, account, connection, CLI, SDK, or migration was created. The static shell has no persistence requirement. Resolve V1 workflow and tenancy before executing schema changes.

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
