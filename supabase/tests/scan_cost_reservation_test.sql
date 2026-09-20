-- Test-only pricing and budget fixtures. Run only on disposable Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is((select count(*) from app_private.scan_provider_configs), 0::bigint,
  'production migrations seed no provider pricing');
select is((select count(*) from app_private.workspace_scan_controls), 0::bigint,
  'production migrations seed no workspace paid-call entitlement');
select is((select count(*) from app_private.project_scan_controls), 0::bigint,
  'production migrations seed no project paid-call entitlement');

insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'budget-owner-a@example.test'),
  ('c1000000-0000-4000-8000-000000000002', 'budget-owner-b@example.test'),
  ('c1000000-0000-4000-8000-000000000003', 'budget-outsider@example.test');
insert into public.workspaces (id, name, created_by) values
  ('c2000000-0000-4000-8000-000000000001', 'Budget Agency A', 'c1000000-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000002', 'Budget Agency B', 'c1000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'owner'),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'owner');
insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Budget Client A', 'budget-a.example.test', 'c1000000-0000-4000-8000-000000000001'),
  ('c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002', 'Budget Client B', 'budget-b.example.test', 'c1000000-0000-4000-8000-000000000002');

insert into public.company_profile_snapshots (
  id, workspace_id, project_id, idempotency_key, request_fingerprint,
  capture_method_version, captured_at, crawl_result, profile_method_version, profile
) values
  (
    'c5000000-0000-4000-8000-000000000101',
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c5100000-0000-4000-8000-000000000101', repeat('a', 64),
    'native-entry-page-v1', now(),
    '{"ok":true,"pages":[{}]}'::jsonb,
    'company-profile-v2',
    '{"methodVersion":"company-profile-v2","fields":{"companyName":{"status":"unknown"},"productName":{"status":"unknown"},"shortDescription":{"status":"unknown"},"primaryProduct":{"status":"unknown"},"targetAudience":{"status":"unknown"},"industry":{"status":"unknown"},"keyUseCases":{"status":"unknown"},"capabilities":{"status":"unknown"},"geography":{"status":"unknown"}},"excludedPages":[]}'::jsonb
  ),
  (
    'c5000000-0000-4000-8000-000000000102',
    'c2000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002',
    'c5100000-0000-4000-8000-000000000102', repeat('b', 64),
    'native-entry-page-v1', now(),
    '{"ok":true,"pages":[{}]}'::jsonb,
    'company-profile-v2',
    '{"methodVersion":"company-profile-v2","fields":{"companyName":{"status":"unknown"},"productName":{"status":"unknown"},"shortDescription":{"status":"unknown"},"primaryProduct":{"status":"unknown"},"targetAudience":{"status":"unknown"},"industry":{"status":"unknown"},"keyUseCases":{"status":"unknown"},"capabilities":{"status":"unknown"},"geography":{"status":"unknown"}},"excludedPages":[]}'::jsonb
  );

create function pg_temp.make_prompt_cohort(
  p_workspace_id uuid,
  p_project_id uuid,
  p_profile_snapshot_id uuid,
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
    p_cohort_id, p_workspace_id, p_project_id, p_profile_snapshot_id, p_idempotency_key,
    repeat('c', 64), 'niche-prompts-v1', 'company-profile-v2', 'en', null, p_query_count
  );

  insert into public.prompt_cohort_queries (
    workspace_id, project_id, cohort_id, query_ordinal, query_id,
    category, template_version, query_text, language, locale, state, evidence_refs
  )
  select
    p_workspace_id,
    p_project_id,
    p_cohort_id,
    ordinal::smallint,
    'niche-prompts-v1:' || p_cohort_id::text || ':' || ordinal::text,
    'category-discovery',
    'category@v1',
    'Test query ' || ordinal::text,
    'en',
    null,
    'planned',
    '[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]}]'::jsonb
  from generate_series(0, p_query_count - 1) ordinal;
end;
$$;

select pg_temp.make_prompt_cohort(
  'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000101', 'c6000000-0000-4000-8000-000000000001',
  'c6100000-0000-4000-8000-000000000001', 2);
select pg_temp.make_prompt_cohort(
  'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000101', 'c6000000-0000-4000-8000-000000000002',
  'c6100000-0000-4000-8000-000000000002', 1);
select pg_temp.make_prompt_cohort(
  'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000101', 'c6000000-0000-4000-8000-000000000003',
  'c6100000-0000-4000-8000-000000000003', 4);
select pg_temp.make_prompt_cohort(
  'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000101', 'c6000000-0000-4000-8000-000000000004',
  'c6100000-0000-4000-8000-000000000004', 1);
select pg_temp.make_prompt_cohort(
  'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000101', 'c6000000-0000-4000-8000-000000000005',
  'c6100000-0000-4000-8000-000000000005', 1);
select pg_temp.make_prompt_cohort(
  'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000101', 'c6000000-0000-4000-8000-000000000006',
  'c6100000-0000-4000-8000-000000000006', 1);
select pg_temp.make_prompt_cohort(
  'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000101', 'c6000000-0000-4000-8000-000000000011',
  'c6100000-0000-4000-8000-000000000011', 1);
select pg_temp.make_prompt_cohort(
  'c2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002',
  'c5000000-0000-4000-8000-000000000102', 'c6000000-0000-4000-8000-000000000007',
  'c6100000-0000-4000-8000-000000000007', 1);
select pg_temp.make_prompt_cohort(
  'c2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002',
  'c5000000-0000-4000-8000-000000000102', 'c6000000-0000-4000-8000-000000000008',
  'c6100000-0000-4000-8000-000000000008', 1);
select pg_temp.make_prompt_cohort(
  'c2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002',
  'c5000000-0000-4000-8000-000000000102', 'c6000000-0000-4000-8000-000000000009',
  'c6100000-0000-4000-8000-000000000009', 1);
select pg_temp.make_prompt_cohort(
  'c2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002',
  'c5000000-0000-4000-8000-000000000102', 'c6000000-0000-4000-8000-000000000010',
  'c6100000-0000-4000-8000-000000000010', 1);

select ok(not has_table_privilege('authenticated', 'app_private.scan_provider_configs', 'select'),
  'authenticated callers cannot read provider pricing controls');
select ok(not has_table_privilege('authenticated', 'app_private.scan_cost_reservations', 'select'),
  'authenticated callers cannot read private cost ledger rows');
select ok(not has_function_privilege('authenticated',
  'public.reserve_scan(uuid,uuid,uuid,text,text,jsonb)', 'execute'),
  'legacy caller-supplied query reservation is revoked');
select ok(has_function_privilege('authenticated',
  'public.reserve_scan_from_cohort(uuid,uuid,uuid,uuid)', 'execute'),
  'authenticated callers enter only the cohort-backed reservation RPC');
select ok(not has_function_privilege('authenticated',
  'public.settle_scan_reservation(uuid,uuid,uuid,bigint)', 'execute'),
  'authenticated callers cannot settle their own cost reservations');
select ok(has_function_privilege('service_role',
  'public.settle_scan_reservation(uuid,uuid,uuid,bigint)', 'execute'),
  'service worker role can use the narrow settlement RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001'
  )$$,
  'P0001', 'Scan execution unavailable',
  'missing operator configuration defaults to zero paid scans'
);

reset role;
insert into app_private.scan_provider_configs (
  provider, model_id, price_version, currency,
  worst_case_cost_per_query_microunits, max_output_tokens,
  max_global_active_scans, enabled
) values ('gemini', 'gemini-test-model', 'test-price-v1', 'USD', 100, 4096, 3, true);
insert into app_private.workspace_scan_controls (
  workspace_id, provider, model_id, price_version, enabled,
  max_queries_per_scan, max_attempts_per_scan, max_concurrent_scans,
  max_scans_per_window, budget_window_start, budget_window_end, budget_microunits
) values
  ('c2000000-0000-4000-8000-000000000001', 'gemini', 'gemini-test-model', 'test-price-v1', true,
   3, 2, 4, 5, now() - interval '1 hour', now() + interval '1 hour', 1000),
  ('c2000000-0000-4000-8000-000000000002', 'gemini', 'gemini-test-model', 'test-price-v1', true,
   3, 2, 4, 5, now() - interval '1 hour', now() + interval '1 hour', 1000);
insert into app_private.project_scan_controls (
  workspace_id, project_id, enabled,
  max_queries_per_scan, max_attempts_per_scan, max_concurrent_scans,
  max_scans_per_window, budget_window_start, budget_window_end, budget_microunits
) values
  ('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', true,
   3, 2, 4, 5, now() - interval '1 hour', now() + interval '1 hour', 600),
  ('c2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002', true,
   3, 2, 4, 5, now() - interval '1 hour', now() + interval '1 hour', 1000);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select is(
  public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001'
  ) ->> 'reservedMicrounits',
  '400',
  'worst-case reservation is cohort queries times attempts times configured upper bound'
);
select is((select count(*) from public.scans), 1::bigint,
  'reservation atomically persists one scan');
select is((select count(*) from public.scan_queries), 2::bigint,
  'reservation atomically snapshots ordered cohort queries');
select is((select count(*) from public.scan_prompt_cohorts), 1::bigint,
  'reservation binds the scan to one durable prompt cohort');
select is(
  public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001'
  ) ->> 'replayed',
  'true',
  'same idempotency key and cohort replay without new reservation'
);

reset role;
select is((select count(*) from app_private.scan_cost_reservations), 1::bigint,
  'replay creates no duplicate cost reservation');
select ok(
  (select request_fingerprint ~ '^[0-9a-f]{64}$' from public.scans),
  'database computes and stores a lowercase SHA-256 request fingerprint'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000002'
  )$$,
  '22023', 'Idempotency key reused with different scan request',
  'idempotency key cannot be reused with a changed cohort query payload'
);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000002',
    'c6000000-0000-4000-8000-000000000003'
  )$$,
  'P0001', 'Scan query limit exceeded',
  'configured query limit fails closed before reserving cost'
);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000003',
    'c6000000-0000-4000-8000-000000000007'
  )$$,
  '42501', null,
  'workspace member cannot reserve a scan for another tenant project/cohort'
);
select throws_ok($$select * from app_private.scan_cost_reservations$$,
  '42501', null, 'client cannot inspect private reservation ledger');

select is(
  public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000004',
    'c6000000-0000-4000-8000-000000000004'
  ) ->> 'reservedMicrounits',
  '200', 'a second request reserves the remaining project budget'
);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000005',
    'c6000000-0000-4000-8000-000000000005'
  )$$,
  'P0001', 'Project scan budget exhausted',
  'project budget is enforced against reserved worst-case cost'
);

reset role;
update app_private.scan_provider_configs
set max_global_active_scans = 2
where provider = 'gemini' and model_id = 'gemini-test-model' and price_version = 'test-price-v1';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000006',
    'c6000000-0000-4000-8000-000000000007'
  )$$,
  'P0001', 'Provider scan concurrency exhausted',
  'provider-level concurrency cap is enforced across tenants'
);

reset role;
set local role service_role;
select is(
  public.settle_scan_reservation(
    'c2000000-0000-4000-8000-000000000001',
    (select id from public.scans where idempotency_key = 'c4000000-0000-4000-8000-000000000001'),
    'c5000000-0000-4000-8000-000000000001', 300
  ) ->> 'status',
  'settled', 'service settlement records confirmed cost separately from reserved cost'
);
select is(
  public.settle_scan_reservation(
    'c2000000-0000-4000-8000-000000000001',
    (select id from public.scans where idempotency_key = 'c4000000-0000-4000-8000-000000000001'),
    'c5000000-0000-4000-8000-000000000001', 300
  ) ->> 'replayed',
  'true', 'same settlement key and amount is idempotent'
);
select throws_ok(
  $$select public.settle_scan_reservation(
    'c2000000-0000-4000-8000-000000000001',
    (select id from public.scans where idempotency_key = 'c4000000-0000-4000-8000-000000000001'),
    'c5000000-0000-4000-8000-000000000002', 300
  )$$,
  '22023', 'Settlement key reused with different scan settlement',
  'settled reservation cannot be rewritten with another settlement key'
);
select is(
  public.settle_scan_reservation(
    'c2000000-0000-4000-8000-000000000001',
    (select id from public.scans where idempotency_key = 'c4000000-0000-4000-8000-000000000004'),
    'c5000000-0000-4000-8000-000000000003', 0
  ) ->> 'status',
  'released', 'confirmed zero cost releases unused reservation without deleting history'
);

reset role;
update public.scans set state = 'running'
where workspace_id = 'c2000000-0000-4000-8000-000000000001';
update public.scans set state = 'completed'
where workspace_id = 'c2000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select is(
  public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000007',
    'c6000000-0000-4000-8000-000000000006'
  ) ->> 'reservedMicrounits',
  '200', 'settlement releases only confirmed unused budget for later work'
);

reset role;
update public.scans set state = 'running'
where idempotency_key = 'c4000000-0000-4000-8000-000000000007';
update public.scans set state = 'completed'
where idempotency_key = 'c4000000-0000-4000-8000-000000000007';
update app_private.workspace_scan_controls
set max_scans_per_window = 1
where workspace_id = 'c2000000-0000-4000-8000-000000000002';
update app_private.project_scan_controls
set max_scans_per_window = 1
where workspace_id = 'c2000000-0000-4000-8000-000000000002'
  and project_id = 'c3000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select is(
  public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000008',
    'c6000000-0000-4000-8000-000000000008'
  ) ->> 'reservedMicrounits',
  '200', 'first request inside the configured window is reserved'
);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000009',
    'c6000000-0000-4000-8000-000000000009'
  )$$,
  'P0001', 'Workspace scan request limit exhausted',
  'workspace request-window cap is enforced before another reservation'
);

reset role;
update public.scans set state = 'running'
where idempotency_key = 'c4000000-0000-4000-8000-000000000008';
update public.scans set state = 'completed'
where idempotency_key = 'c4000000-0000-4000-8000-000000000008';
update app_private.scan_provider_configs
set enabled = false
where provider = 'gemini' and model_id = 'gemini-test-model' and price_version = 'test-price-v1';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000010',
    'c6000000-0000-4000-8000-000000000010'
  )$$,
  'P0001', 'Provider pricing unavailable',
  'operator provider switch immediately blocks new paid work'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated","user_metadata":{"workspace_id":"c2000000-0000-4000-8000-000000000001","role":"owner"}}', true
);
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000011',
    'c6000000-0000-4000-8000-000000000011'
  )$$,
  '42501', null,
  'editable auth metadata cannot grant budget or workspace access'
);

select * from finish();
rollback;
