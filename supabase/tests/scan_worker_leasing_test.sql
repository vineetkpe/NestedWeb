-- Worker lease/retry fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'worker-owner@example.test');
insert into public.workspaces (id, name, created_by) values
  ('e2000000-0000-4000-8000-000000000001', 'Worker Agency', 'e1000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'owner');
insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
   'Worker Client', 'worker.example.test', 'e1000000-0000-4000-8000-000000000001');

insert into public.company_profile_snapshots (
  id, workspace_id, project_id, idempotency_key, request_fingerprint,
  capture_method_version, captured_at, crawl_result, profile_method_version, profile
) values (
  'e7000000-0000-4000-8000-000000000101',
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e7100000-0000-4000-8000-000000000101', repeat('e', 64),
  'native-entry-page-v1', now(), '{"ok":true,"pages":[{}]}'::jsonb,
  'company-profile-v2',
  '{"methodVersion":"company-profile-v2","fields":{"companyName":{"status":"unknown"},"productName":{"status":"unknown"},"shortDescription":{"status":"unknown"},"primaryProduct":{"status":"unknown"},"targetAudience":{"status":"unknown"},"industry":{"status":"unknown"},"keyUseCases":{"status":"unknown"},"capabilities":{"status":"unknown"},"geography":{"status":"unknown"}},"excludedPages":[]}'::jsonb
);

create function pg_temp.make_worker_cohort(
  p_cohort_id uuid,
  p_idempotency_key uuid,
  p_query_count integer
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
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'e7000000-0000-4000-8000-000000000101',
    p_idempotency_key, repeat('d', 64),
    'niche-prompts-v1', 'company-profile-v2', 'en', null, p_query_count
  );

  insert into public.prompt_cohort_queries (
    workspace_id, project_id, cohort_id, query_ordinal, query_id,
    category, template_version, query_text, language, locale, state, evidence_refs
  )
  select
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    p_cohort_id,
    ordinal::smallint,
    'niche-prompts-v1:' || p_cohort_id::text || ':' || ordinal::text,
    'category-discovery', 'category@v1', 'Worker query ' || ordinal::text,
    'en', null, 'planned',
    '[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]}]'::jsonb
  from generate_series(0, p_query_count - 1) ordinal;
end;
$$;
select pg_temp.make_worker_cohort(
  'e8000000-0000-4000-8000-000000000001',
  'e8100000-0000-4000-8000-000000000001', 2);
select pg_temp.make_worker_cohort(
  'e8000000-0000-4000-8000-000000000002',
  'e8100000-0000-4000-8000-000000000002', 1);
select pg_temp.make_worker_cohort(
  'e8000000-0000-4000-8000-000000000003',
  'e8100000-0000-4000-8000-000000000003', 1);

insert into app_private.scan_provider_configs (
  provider, model_id, price_version, currency,
  worst_case_cost_per_query_microunits, max_output_tokens,
  max_global_active_scans, enabled
) values ('gemini', 'gemini-worker-test', 'worker-price-v1', 'USD', 10, 2048, 10, true);
insert into app_private.workspace_scan_controls (
  workspace_id, provider, model_id, price_version, enabled,
  max_queries_per_scan, max_attempts_per_scan, max_concurrent_scans,
  max_scans_per_window, budget_window_start, budget_window_end, budget_microunits
) values (
  'e2000000-0000-4000-8000-000000000001', 'gemini', 'gemini-worker-test', 'worker-price-v1', true,
  10, 2, 10, 10, now() - interval '1 hour', now() + interval '1 hour', 10000
);
insert into app_private.project_scan_controls (
  workspace_id, project_id, enabled,
  max_queries_per_scan, max_attempts_per_scan, max_concurrent_scans,
  max_scans_per_window, budget_window_start, budget_window_end, budget_microunits
) values (
  'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', true,
  10, 2, 10, 10, now() - interval '1 hour', now() + interval '1 hour', 10000
);

create temp table c3_claims (
  label text primary key,
  payload jsonb
);
grant select, insert, update, delete on table pg_temp.c3_claims to service_role;

select ok(not has_table_privilege('authenticated', 'app_private.scan_worker_leases', 'select'),
  'authenticated callers cannot inspect worker leases');
select ok(not has_function_privilege('authenticated',
  'public.claim_scan_work(uuid,integer)', 'execute'),
  'authenticated callers cannot claim scan work');
select ok(not has_function_privilege('authenticated',
  'public.renew_scan_work_lease(uuid,uuid,uuid,uuid,uuid,integer)', 'execute'),
  'authenticated callers cannot renew worker leases');
select ok(not has_function_privilege('authenticated',
  'public.retry_scan_work(uuid,uuid,uuid,uuid,uuid)', 'execute'),
  'authenticated callers cannot schedule worker retries');
select ok(has_function_privilege('service_role',
  'public.claim_scan_work(uuid,integer)', 'execute'),
  'service role can claim work through the narrow RPC');
select ok(has_function_privilege('service_role',
  'public.renew_scan_work_lease(uuid,uuid,uuid,uuid,uuid,integer)', 'execute'),
  'service role can heartbeat an owned lease');
select ok(has_function_privilege('service_role',
  'public.retry_scan_work(uuid,uuid,uuid,uuid,uuid)', 'execute'),
  'service role can explicitly schedule a bounded retry');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.claim_scan_work('e5000000-0000-4000-8000-000000000001', 60)$$,
  '42501', null,
  'customer role cannot enter worker claim RPC'
);
select public.reserve_scan_from_cohort(
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000001'
);

reset role;
set local role service_role;
insert into pg_temp.c3_claims (label, payload)
select 'first', public.claim_scan_work('e5000000-0000-4000-8000-000000000001', 60);
select ok((select payload is not null from pg_temp.c3_claims where label = 'first'),
  'service worker claims one queued scan');
select is((select payload ->> 'attemptNumber' from pg_temp.c3_claims where label = 'first'),
  '1', 'first claim creates attempt one');
select is((select jsonb_array_length(payload -> 'queries') from pg_temp.c3_claims where label = 'first'),
  2, 'claim returns the exact ordered query cohort');
select is((select payload ->> 'workerId' from pg_temp.c3_claims where label = 'first'),
  'e5000000-0000-4000-8000-000000000001', 'claim binds the worker identity');
select ok(public.claim_scan_work('e5000000-0000-4000-8000-000000000002', 60) is null,
  'a second worker cannot double-claim the running scan');

reset role;
select is((select state from public.scans where idempotency_key = 'e4000000-0000-4000-8000-000000000001'),
  'running', 'claim moves the scan to running');
select is((select count(*) from public.scan_attempts
  where scan_id = (select id from public.scans where idempotency_key = 'e4000000-0000-4000-8000-000000000001')),
  1::bigint, 'claim creates exactly one durable attempt');
select is((select count(*) from public.scan_attempt_queries
  where scan_id = (select id from public.scans where idempotency_key = 'e4000000-0000-4000-8000-000000000001')),
  2::bigint, 'claim reserves one observation identity per query');
select is((select count(distinct observation_id) from public.scan_attempt_queries
  where scan_id = (select id from public.scans where idempotency_key = 'e4000000-0000-4000-8000-000000000001')),
  2::bigint, 'reserved observation identities are distinct');
select is((select count(*) from app_private.scan_worker_leases), 1::bigint,
  'only one active lease exists for the scan');

set local role service_role;
select throws_ok(
  $$select public.renew_scan_work_lease(
    (select (payload ->> 'workspaceId')::uuid from pg_temp.c3_claims where label = 'first'),
    (select (payload ->> 'scanId')::uuid from pg_temp.c3_claims where label = 'first'),
    (select (payload ->> 'attemptId')::uuid from pg_temp.c3_claims where label = 'first'),
    'e5000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000099', 60
  )$$,
  'P0001', 'Scan lease not found',
  'a forged lease token cannot heartbeat work'
);
select is(
  public.renew_scan_work_lease(
    (select (payload ->> 'workspaceId')::uuid from pg_temp.c3_claims where label = 'first'),
    (select (payload ->> 'scanId')::uuid from pg_temp.c3_claims where label = 'first'),
    (select (payload ->> 'attemptId')::uuid from pg_temp.c3_claims where label = 'first'),
    'e5000000-0000-4000-8000-000000000001',
    (select (payload ->> 'leaseToken')::uuid from pg_temp.c3_claims where label = 'first'),
    60
  ) ->> 'leaseToken',
  (select payload ->> 'leaseToken' from pg_temp.c3_claims where label = 'first'),
  'matching worker and token renew the active lease'
);
insert into pg_temp.c3_claims (label, payload)
select 'retry-one', public.retry_scan_work(
  (select (payload ->> 'workspaceId')::uuid from pg_temp.c3_claims where label = 'first'),
  (select (payload ->> 'scanId')::uuid from pg_temp.c3_claims where label = 'first'),
  (select (payload ->> 'attemptId')::uuid from pg_temp.c3_claims where label = 'first'),
  'e5000000-0000-4000-8000-000000000001',
  (select (payload ->> 'leaseToken')::uuid from pg_temp.c3_claims where label = 'first')
);
select is((select payload ->> 'nextState' from pg_temp.c3_claims where label = 'retry-one'),
  'queued', 'retryable failure requeues the scan');
select is((select payload ->> 'retryScheduled' from pg_temp.c3_claims where label = 'retry-one'),
  'true', 'retry is scheduled only while the reserved attempt budget remains');

insert into pg_temp.c3_claims (label, payload)
select 'second', public.claim_scan_work('e5000000-0000-4000-8000-000000000002', 60);
select is((select payload ->> 'attemptNumber' from pg_temp.c3_claims where label = 'second'),
  '2', 'reclaimed work advances to attempt two');
select isnt((select payload ->> 'attemptId' from pg_temp.c3_claims where label = 'second'),
  (select payload ->> 'attemptId' from pg_temp.c3_claims where label = 'first'),
  'each retry gets a distinct attempt identity');
select throws_ok(
  $$select public.renew_scan_work_lease(
    (select (payload ->> 'workspaceId')::uuid from pg_temp.c3_claims where label = 'first'),
    (select (payload ->> 'scanId')::uuid from pg_temp.c3_claims where label = 'first'),
    (select (payload ->> 'attemptId')::uuid from pg_temp.c3_claims where label = 'first'),
    'e5000000-0000-4000-8000-000000000001',
    (select (payload ->> 'leaseToken')::uuid from pg_temp.c3_claims where label = 'first'),
    60
  )$$,
  'P0001', 'Scan lease not found',
  'stale worker token cannot mutate a reclaimed scan'
);
insert into pg_temp.c3_claims (label, payload)
select 'retry-two', public.retry_scan_work(
  (select (payload ->> 'workspaceId')::uuid from pg_temp.c3_claims where label = 'second'),
  (select (payload ->> 'scanId')::uuid from pg_temp.c3_claims where label = 'second'),
  (select (payload ->> 'attemptId')::uuid from pg_temp.c3_claims where label = 'second'),
  'e5000000-0000-4000-8000-000000000002',
  (select (payload ->> 'leaseToken')::uuid from pg_temp.c3_claims where label = 'second')
);
select is((select payload ->> 'nextState' from pg_temp.c3_claims where label = 'retry-two'),
  'failed', 'attempt exhaustion terminally fails the scan');
select is((select payload ->> 'retryScheduled' from pg_temp.c3_claims where label = 'retry-two'),
  'false', 'no retry is scheduled beyond the reserved max-attempt budget');
select ok(public.claim_scan_work('e5000000-0000-4000-8000-000000000001', 60) is null,
  'exhausted scan is never claimed again');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select public.reserve_scan_from_cohort(
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000002',
  'e8000000-0000-4000-8000-000000000002'
);
reset role;
set local role service_role;
insert into pg_temp.c3_claims (label, payload)
select 'expired-first', public.claim_scan_work('e5000000-0000-4000-8000-000000000001', 60);
reset role;
update app_private.scan_worker_leases
set claimed_at = clock_timestamp() - interval '3 minutes',
    heartbeat_at = clock_timestamp() - interval '2 minutes',
    lease_expires_at = clock_timestamp() - interval '1 minute'
where scan_id = (select (payload ->> 'scanId')::uuid from pg_temp.c3_claims where label = 'expired-first');

set local role service_role;
insert into pg_temp.c3_claims (label, payload)
select 'expired-second', public.claim_scan_work('e5000000-0000-4000-8000-000000000002', 60);
select is((select payload ->> 'scanId' from pg_temp.c3_claims where label = 'expired-second'),
  (select payload ->> 'scanId' from pg_temp.c3_claims where label = 'expired-first'),
  'next claimant recovers and reclaims an expired scan');
select is((select payload ->> 'attemptNumber' from pg_temp.c3_claims where label = 'expired-second'),
  '2', 'expired lease recovery consumes exactly one retry attempt');
select throws_ok(
  $$select public.renew_scan_work_lease(
    (select (payload ->> 'workspaceId')::uuid from pg_temp.c3_claims where label = 'expired-first'),
    (select (payload ->> 'scanId')::uuid from pg_temp.c3_claims where label = 'expired-first'),
    (select (payload ->> 'attemptId')::uuid from pg_temp.c3_claims where label = 'expired-first'),
    'e5000000-0000-4000-8000-000000000001',
    (select (payload ->> 'leaseToken')::uuid from pg_temp.c3_claims where label = 'expired-first'),
    60
  )$$,
  'P0001', 'Scan lease not found',
  'expired worker loses authority after recovery'
);

reset role;
select is((select state from public.scan_attempts
  where id = (select (payload ->> 'attemptId')::uuid from pg_temp.c3_claims where label = 'expired-first')),
  'failed', 'expired attempt is durably failed before retry');
select is((select state from public.scan_attempts
  where id = (select (payload ->> 'attemptId')::uuid from pg_temp.c3_claims where label = 'expired-second')),
  'running', 'replacement attempt is running under the new lease');
select is((select count(*) from public.scan_attempt_queries
  where attempt_id = (select (payload ->> 'attemptId')::uuid from pg_temp.c3_claims where label = 'expired-first')
    and state = 'failed'),
  1::bigint, 'unfinished observations from an expired attempt are failed');

set local role service_role;
select public.retry_scan_work(
  (select (payload ->> 'workspaceId')::uuid from pg_temp.c3_claims where label = 'expired-second'),
  (select (payload ->> 'scanId')::uuid from pg_temp.c3_claims where label = 'expired-second'),
  (select (payload ->> 'attemptId')::uuid from pg_temp.c3_claims where label = 'expired-second'),
  'e5000000-0000-4000-8000-000000000002',
  (select (payload ->> 'leaseToken')::uuid from pg_temp.c3_claims where label = 'expired-second')
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select public.reserve_scan_from_cohort(
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000003',
  'e8000000-0000-4000-8000-000000000003'
);
reset role;
update app_private.scan_provider_configs
set enabled = false
where provider = 'gemini'
  and model_id = 'gemini-worker-test'
  and price_version = 'worker-price-v1';
set local role service_role;
select ok(public.claim_scan_work('e5000000-0000-4000-8000-000000000001', 60) is null,
  'provider kill switch prevents queued work from starting');

reset role;
select is((select state from public.scans where idempotency_key = 'e4000000-0000-4000-8000-000000000003'),
  'queued', 'kill-switched scan remains queued without a worker attempt');
select is((select count(*) from public.scan_attempts
  where scan_id = (select id from public.scans where idempotency_key = 'e4000000-0000-4000-8000-000000000003')),
  0::bigint, 'kill switch creates no attempt or provider work');

select * from finish();
rollback;
