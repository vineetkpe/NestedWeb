# Authenticated tenancy security exit

Status: verification slice for the current authenticated tenancy foundation. This is not a production security certification and does not authorize live crawling, grounded-provider execution, billing, uploads, invitations, or a routed customer dashboard.

## Exit criteria

B6 is complete only when all of the following are true on the same commit:

- application CI passes formatting, lint, typecheck, production build, unit/e2e tests, and `npm audit --audit-level=high`;
- a disposable Supabase database starts in CI, replays every checked-in migration, and passes every pgTAP test under `supabase/tests`;
- the current tenancy test reflects replay-safe project creation: authenticated callers cannot insert projects directly and must use `public.create_project(...)`;
- tests cover anonymous denial, cross-tenant reads/writes, forged editable metadata, immutable tenant fields, current-membership revocation, workspace bootstrap idempotency, project-creation idempotency, and private idempotency-state denial;
- the connected Supabase project reports no security-advisor findings after the reviewed migration chain;
- hosted rollback-only smoke checks leave no test fixtures behind.

## RPC boundary review — 2026-09-12

The repository Data API configuration exposes only `public` and `graphql_public`; `app_private` is not an exposed API schema. Public mutation wrappers remain `SECURITY INVOKER` with fixed empty `search_path` and explicit authenticated-only execution grants. The private implementations are `SECURITY DEFINER`, derive identity from `auth.uid()`, and enforce the mutation invariants themselves.

During this exit review, an experimental migration changed the public wrappers to `SECURITY DEFINER` and revoked authenticated access to `app_private`. Supabase's security advisor immediately produced two warnings because the exposed public RPCs became signed-in-executable definer functions. A compensating migration restored the reviewed invoker pattern. Both migrations remain checked in because they are part of the applied hosted migration history; their net schema effect is the original invoker design.

After the restore, the Supabase security advisor returned zero findings. A rollback-only hosted smoke test created one workspace and one project through the public RPCs under a synthetic authenticated subject, observed exactly one visible workspace/project, and rolled the transaction back.

## What this exit does not prove

The routed Next.js application is still a static product/report preview; these server/database boundaries are not yet exposed as a customer workflow. This exit does not prove production cookie policy, CSRF defenses on future mutations, redirect policy on a real host, production CSP/HSTS, distributed rate limits, provider cost reservations, live provider egress, billing-webhook verification, incident response, or penetration-test coverage. Those controls must land with the surfaces that need them rather than being claimed early.

The connected hosted project is useful verification evidence, but CI's disposable database is the repeatable merge gate. Hosted configuration outside the checked-in migration/config files must not be inferred from local configuration alone.
