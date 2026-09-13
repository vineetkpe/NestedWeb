-- Targeted worker claim fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'targeted-worker-owner@example.test');
insert into public.workspaces (id, name, created_by) values
  ('f2000000-0000-4000-8000-000000000001', 'Targeted Worker Agency', 'f1000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'owner');
insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
   'Targeted Worker Client', 'targeted-worker.example.test', 'f1000000-0000-4000-8000-000000000001');

insert into public.company_profile_snapshots (
  id, workspace_id, project_id, idempotency_key, request_fingerprint,
  capture_method_version, captured_at, crawl_result, profile_method_version, profile
) values (
  'f7000000-0000-4000-8000-000000000101',
  'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f7100000-0000-4000-8000-000000000101', repeat('f', 64),
  'native-entry-page-v1', now(), '{"ok":true,"pages":[{}]}'::jsonb,
  'company-profile-v2',
  '{"methodVersion":"company-profile-v2","fields":{"companyName":{"status":"unknown"},"productName":{"status":"unknown"},"shortDescription":{"status":"unknown"},"primaryProduct":{"status":"unknown"},"targetAudience":{"status":"unknown"},"industry":{"status":"unknown"},"keyUseCases":{"status":"unknown"},"capabilities":{"status":"unknown"},"geography":{"status":"unknown"}},"excludedPages":[]}'::jsonb
);

create function pg_temp.make_targeted_cohort(
  p_cohort_id uuid,
  p_idempotency_key uuid
)
returns void
language plpgsql
as $$
begin
  insert into public.prompt_cohorts (
    id, workspace_id, project_id, profile_snapshot_id, idempotency_key,
    request_fingerprint, prompt_method_version, profile_method_version,
    language, locale, query_count
  ) values (
    p_cohort_id,
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000101',
    p_idempotency_key, repeat('c', 64),
    'niche-prompts-v1', 'company-profile-v2', 'en', null, 1
  );

  insert into public.prompt_cohort_queries (
    workspace_id, project_id, cohort_id, query_ordinal, query_id,
    category, template_version, query_text, language, locale, state, evidence_refs
  ) values (
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    p_cohort_id, 0,
    'niche-prompts-v1:' || p_cohort_id::text || ':0',
    'category-discovery', 'category@v1', 'Targeted worker query',
    'en', null, 'planned',
    '[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]}]'::jsonb
  );
end;
$$;

select pg_temp.make_targeted_cohort(
  'f8000000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001'
);
select pg_temp.make_targeted_cohort(
  'f8000000-0000-4000-8000-000000000002',
  'f8100000-0000-4000-8000-000000000002'
);

insert into app_private.scan_provider_configs (
  provider, model_id, price_version, currency,
  worst_case_cost_per_query_microunits, max_output_tokens,
  max_global_active_scans, enabled
) values ('gemini', 'gemini-targeted-worker-test', 'targeted-worker-price-v1', 'USD', 10, 2048, 10, true);
insert into app_private.scan_provider_metering_configs (
  provider, model_id, price_version,
  input_microunits_per_million_tokens,
  output_microunits_per_million_tokens,
  search_microunits_per_thousand_queries
) values ('gemini', 'gemini-targeted-worker-test', 'targeted-worker-price-v1', 1, 1, 1);
insert into app_private.workspace_scan_controls (
  workspace_id, provider, model_id, price_version, enabled,
  max_queries_per_scan, max_attempts_per_scan, max_concurrent_scans,
  max_scans_per_window, budget_window_start, budget_window_end, budget_microunits
) values (
  'f2000000-0000-4000-8000-000000000001', 'gemini', 'gemini-targeted-worker-test', 'targeted-worker-price-v1', true,
  10, 2, 10, 10, now() - interval '1 hour', now() + interval '1 hour', 10000
);
insert into app_private.project_scan_controls (
  workspace_id, project_id, enabled,
  max_queries_per_scan, max_attempts_per_scan, max_concurrent_scans,
  max_scans_per_window, budget_window_start, budget_window_end, budget_microunits
) values (
  'f2000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', true,
  10, 2, 10, 10, now() - interval '1 hour', now() + interval '1 hour', 10000
);

select ok(not has_function_privilege('anon',
  'public.claim_scan_work_for_scan(uuid,uuid,uuid,uuid,uuid,integer)', 'execute'),
  'anonymous callers cannot target worker claims');
select ok(not has_function_privilege('authenticated',
  'public.claim_scan_work_for_scan(uuid,uuid,uuid,uuid,uuid,integer)', 'execute'),
  'authenticated callers cannot target worker claims');
select ok(has_function_privilege('service_role',
  'public.claim_scan_work_for_scan(uuid,uuid,uuid,uuid,uuid,integer)', 'execute'),
  'service role can use the targeted worker claim RPC');

create temp table targeted_reservations (
  label text primary key,
  payload jsonb not null
);
create temp table targeted_ordered (
  ordinal integer primary key,
  payload jsonb not null
);
create temp table targeted_claims (
  label text primary key,
  payload jsonb not null
);
grant select, insert, update, delete on table pg_temp.targeted_reservations to authenticated, service_role;
grant select, insert, update, delete on table pg_temp.targeted_ordered to service_role;
grant select, insert, update, delete on table pg_temp.targeted_claims to service_role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.claim_scan_work_for_scan(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000001',
    'f6000000-0000-4000-8000-000000000001', 60
  )$$,
  '42501', null,
  'customer role cannot enter targeted worker claim RPC'
);
insert into pg_temp.targeted_reservations (label, payload)
select 'one', public.reserve_scan_from_cohort(
  'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000001'
);
insert into pg_temp.targeted_reservations (label, payload)
select 'two', public.reserve_scan_from_cohort(
  'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000002',
  'f8000000-0000-4000-8000-000000000002'
);

reset role;
insert into pg_temp.targeted_ordered (ordinal, payload)
select row_number() over (order by scan.created_at, scan.id)::integer, reservation.payload
from pg_temp.targeted_reservations reservation
join public.scans scan on scan.id = (reservation.payload ->> 'scanId')::uuid;

set local role service_role;
select ok(
  public.claim_scan_work_for_scan(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    ((select payload from pg_temp.targeted_ordered where ordinal = 2) ->> 'scanId')::uuid,
    ((select payload from pg_temp.targeted_ordered where ordinal = 2) ->> 'reservationId')::uuid,
    'f6000000-0000-4000-8000-000000000001',
    60
  ) is null,
  'targeting later queued work returns null instead of claiming a different scan'
);

reset role;
select is((select count(*) from public.scan_attempts), 0::bigint,
  'mismatched targeted claim rolls back the provisional attempt');
select is((select count(*) from app_private.scan_worker_leases), 0::bigint,
  'mismatched targeted claim rolls back the provisional lease');
select is((select count(*) from public.scans where state = 'queued'), 2::bigint,
  'mismatched targeted claim leaves both scans queued');

set local role service_role;
insert into pg_temp.targeted_claims (label, payload)
select 'first', public.claim_scan_work_for_scan(
  'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  ((select payload from pg_temp.targeted_ordered where ordinal = 1) ->> 'scanId')::uuid,
  ((select payload from pg_temp.targeted_ordered where ordinal = 1) ->> 'reservationId')::uuid,
  'f6000000-0000-4000-8000-000000000001',
  60
);
select is(
  (select payload ->> 'workspaceId' from pg_temp.targeted_claims where label = 'first'),
  'f2000000-0000-4000-8000-000000000001',
  'targeted claim preserves workspace identity'
);
select is(
  (select payload ->> 'projectId' from pg_temp.targeted_claims where label = 'first'),
  'f3000000-0000-4000-8000-000000000001',
  'targeted claim preserves project identity'
);
select is(
  (select payload ->> 'scanId' from pg_temp.targeted_claims where label = 'first'),
  (select payload ->> 'scanId' from pg_temp.targeted_ordered where ordinal = 1),
  'targeted claim returns the exact requested scan'
);
select is(
  (select payload ->> 'reservationId' from pg_temp.targeted_claims where label = 'first'),
  (select payload ->> 'reservationId' from pg_temp.targeted_ordered where ordinal = 1),
  'targeted claim returns the exact requested reservation'
);
select is(
  (select payload ->> 'workerId' from pg_temp.targeted_claims where label = 'first'),
  'f6000000-0000-4000-8000-000000000001',
  'targeted claim binds the requested worker identity'
);

reset role;
select is((select count(*) from public.scan_attempts), 1::bigint,
  'successful targeted claim creates exactly one attempt');
select is((select count(*) from app_private.scan_worker_leases), 1::bigint,
  'successful targeted claim creates exactly one active lease');
select is((select count(*) from public.scans where state = 'running'), 1::bigint,
  'only the targeted scan transitions to running');
select is((select count(*) from public.scans where state = 'queued'), 1::bigint,
  'the other reserved scan remains queued');

select * from finish();
rollback;
