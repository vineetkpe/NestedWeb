-- Mid-lease execution kill-switch fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('d1000000-0000-4000-8000-000000000001', 'renewal-gate-owner@example.test');
insert into public.workspaces (id, name, created_by) values
  ('d2000000-0000-4000-8000-000000000001', 'Renewal Gate Agency', 'd1000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'owner');
insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
   'Renewal Gate Client', 'renewal-gate.example.test', 'd1000000-0000-4000-8000-000000000001');

insert into public.company_profile_snapshots (
  id, workspace_id, project_id, idempotency_key, request_fingerprint,
  capture_method_version, captured_at, crawl_result, profile_method_version, profile
) values (
  'd7000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd7100000-0000-4000-8000-000000000001', repeat('a', 64),
  'native-entry-page-v1', now(), '{"ok":true,"pages":[{}]}'::jsonb,
  'company-profile-v2',
  '{"methodVersion":"company-profile-v2","fields":{"companyName":{"status":"unknown"},"productName":{"status":"unknown"},"shortDescription":{"status":"unknown"},"primaryProduct":{"status":"unknown"},"targetAudience":{"status":"unknown"},"industry":{"status":"unknown"},"keyUseCases":{"status":"unknown"},"capabilities":{"status":"unknown"},"geography":{"status":"unknown"}},"excludedPages":[]}'::jsonb
);

insert into public.prompt_cohorts (
  id, workspace_id, project_id, profile_snapshot_id, idempotency_key,
  request_fingerprint, prompt_method_version, profile_method_version,
  language, locale, query_count
) values (
  'd8000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'd8100000-0000-4000-8000-000000000001', repeat('b', 64),
  'niche-prompts-v1', 'company-profile-v2', 'en', null, 1
);
insert into public.prompt_cohort_queries (
  workspace_id, project_id, cohort_id, query_ordinal, query_id,
  category, template_version, query_text, language, locale, state, evidence_refs
) values (
  'd2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001',
  0, 'niche-prompts-v1:renewal-gate:0', 'category-discovery', 'category@v1',
  'Which tools serve renewal gate clients?', 'en', null, 'planned',
  '[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]}]'::jsonb
);

insert into app_private.scan_provider_configs (
  provider, model_id, price_version, currency,
  worst_case_cost_per_query_microunits, max_output_tokens,
  max_global_active_scans, enabled
) values (
  'gemini', 'gemini-renewal-gate-test', 'renewal-gate-v1', 'USD',
  10, 2048, 10, true
);
insert into app_private.scan_provider_metering_configs (
  provider, model_id, price_version,
  input_microunits_per_million_tokens,
  output_microunits_per_million_tokens,
  search_microunits_per_thousand_queries
) values (
  'gemini', 'gemini-renewal-gate-test', 'renewal-gate-v1', 1, 1, 1
);
insert into app_private.workspace_scan_controls (
  workspace_id, provider, model_id, price_version, enabled,
  max_queries_per_scan, max_attempts_per_scan, max_concurrent_scans,
  max_scans_per_window, budget_window_start, budget_window_end, budget_microunits
) values (
  'd2000000-0000-4000-8000-000000000001',
  'gemini', 'gemini-renewal-gate-test', 'renewal-gate-v1', true,
  10, 2, 10, 10, now() - interval '1 hour', now() + interval '1 hour', 10000
);
insert into app_private.project_scan_controls (
  workspace_id, project_id, enabled,
  max_queries_per_scan, max_attempts_per_scan, max_concurrent_scans,
  max_scans_per_window, budget_window_start, budget_window_end, budget_microunits
) values (
  'd2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001', true,
  10, 2, 10, 10, now() - interval '1 hour', now() + interval '1 hour', 10000
);

create temp table renewal_gate_claims (payload jsonb not null);
grant select, insert on table pg_temp.renewal_gate_claims to service_role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select public.reserve_scan_from_cohort(
  'd2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001'
);

reset role;
set local role service_role;
insert into pg_temp.renewal_gate_claims (payload)
select public.claim_scan_work('d5000000-0000-4000-8000-000000000001', 60);
select ok((select payload is not null from pg_temp.renewal_gate_claims),
  'worker claims the scan while every execution control is enabled');

reset role;
update app_private.workspace_scan_controls
set enabled = false
where workspace_id = 'd2000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok(
  $$select public.renew_scan_work_lease(
    (select (payload ->> 'workspaceId')::uuid from pg_temp.renewal_gate_claims),
    (select (payload ->> 'scanId')::uuid from pg_temp.renewal_gate_claims),
    (select (payload ->> 'attemptId')::uuid from pg_temp.renewal_gate_claims),
    'd5000000-0000-4000-8000-000000000001',
    (select (payload ->> 'leaseToken')::uuid from pg_temp.renewal_gate_claims),
    60
  )$$,
  'P0001', 'Scan execution disabled',
  'disabling the workspace stops renewal of already-claimed work'
);

reset role;
update app_private.workspace_scan_controls
set enabled = true
where workspace_id = 'd2000000-0000-4000-8000-000000000001';
update app_private.project_scan_controls
set enabled = false
where workspace_id = 'd2000000-0000-4000-8000-000000000001'
  and project_id = 'd3000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok(
  $$select public.renew_scan_work_lease(
    (select (payload ->> 'workspaceId')::uuid from pg_temp.renewal_gate_claims),
    (select (payload ->> 'scanId')::uuid from pg_temp.renewal_gate_claims),
    (select (payload ->> 'attemptId')::uuid from pg_temp.renewal_gate_claims),
    'd5000000-0000-4000-8000-000000000001',
    (select (payload ->> 'leaseToken')::uuid from pg_temp.renewal_gate_claims),
    60
  )$$,
  'P0001', 'Scan execution disabled',
  'disabling the project stops renewal of already-claimed work'
);

reset role;
update app_private.project_scan_controls
set enabled = true
where workspace_id = 'd2000000-0000-4000-8000-000000000001'
  and project_id = 'd3000000-0000-4000-8000-000000000001';
update app_private.scan_provider_configs
set enabled = false
where provider = 'gemini'
  and model_id = 'gemini-renewal-gate-test'
  and price_version = 'renewal-gate-v1';
set local role service_role;
select throws_ok(
  $$select public.renew_scan_work_lease(
    (select (payload ->> 'workspaceId')::uuid from pg_temp.renewal_gate_claims),
    (select (payload ->> 'scanId')::uuid from pg_temp.renewal_gate_claims),
    (select (payload ->> 'attemptId')::uuid from pg_temp.renewal_gate_claims),
    'd5000000-0000-4000-8000-000000000001',
    (select (payload ->> 'leaseToken')::uuid from pg_temp.renewal_gate_claims),
    60
  )$$,
  'P0001', 'Scan execution disabled',
  'disabling the provider stops renewal of already-claimed work'
);

reset role;
update app_private.scan_provider_configs
set enabled = true
where provider = 'gemini'
  and model_id = 'gemini-renewal-gate-test'
  and price_version = 'renewal-gate-v1';
delete from app_private.scan_provider_metering_configs
where provider = 'gemini'
  and model_id = 'gemini-renewal-gate-test'
  and price_version = 'renewal-gate-v1';
set local role service_role;
select throws_ok(
  $$select public.renew_scan_work_lease(
    (select (payload ->> 'workspaceId')::uuid from pg_temp.renewal_gate_claims),
    (select (payload ->> 'scanId')::uuid from pg_temp.renewal_gate_claims),
    (select (payload ->> 'attemptId')::uuid from pg_temp.renewal_gate_claims),
    'd5000000-0000-4000-8000-000000000001',
    (select (payload ->> 'leaseToken')::uuid from pg_temp.renewal_gate_claims),
    60
  )$$,
  'P0001', 'Scan execution disabled',
  'missing metering config stops renewal before paid work'
);

reset role;
insert into app_private.scan_provider_metering_configs (
  provider, model_id, price_version,
  input_microunits_per_million_tokens,
  output_microunits_per_million_tokens,
  search_microunits_per_thousand_queries
) values (
  'gemini', 'gemini-renewal-gate-test', 'renewal-gate-v1', 1, 1, 1
);
set local role service_role;
select is(
  public.renew_scan_work_lease(
    (select (payload ->> 'workspaceId')::uuid from pg_temp.renewal_gate_claims),
    (select (payload ->> 'scanId')::uuid from pg_temp.renewal_gate_claims),
    (select (payload ->> 'attemptId')::uuid from pg_temp.renewal_gate_claims),
    'd5000000-0000-4000-8000-000000000001',
    (select (payload ->> 'leaseToken')::uuid from pg_temp.renewal_gate_claims),
    60
  ) ->> 'leaseToken',
  (select payload ->> 'leaseToken' from pg_temp.renewal_gate_claims),
  'renewal succeeds again only after every execution control is enabled'
);

reset role;
select * from finish();
rollback;
