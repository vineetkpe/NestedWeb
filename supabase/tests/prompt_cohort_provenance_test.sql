-- Prompt cohort provenance fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'cohort-owner-a@example.test'),
  ('f1000000-0000-4000-8000-000000000002', 'cohort-owner-b@example.test'),
  ('f1000000-0000-4000-8000-000000000003', 'cohort-outsider@example.test');
insert into public.workspaces (id, name, created_by) values
  ('f2000000-0000-4000-8000-000000000001', 'Cohort Agency A', 'f1000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002', 'Cohort Agency B', 'f1000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'owner'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'owner');
insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'Cohort Client A', 'cohort-a.example.test', 'f1000000-0000-4000-8000-000000000001'),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'Cohort Client B', 'cohort-b.example.test', 'f1000000-0000-4000-8000-000000000002');

create temp table c6_profiles (
  label text primary key,
  payload jsonb not null
);
insert into pg_temp.c6_profiles (label, payload) values
  ('a', '{
    "methodVersion":"company-profile-v2",
    "fields":{
      "companyName":{"status":"unknown","reason":"no_supported_statement"},
      "productName":{"status":"unknown","reason":"no_supported_statement"},
      "shortDescription":{"status":"unknown","reason":"no_supported_statement"},
      "primaryProduct":{"status":"unknown","reason":"no_supported_statement"},
      "targetAudience":{"status":"confirmed","values":[{"value":"Agencies","evidence":[{"pageIndex":0,"pageUrl":"https://cohort-a.example.test/","contentField":"markdown","start":32,"end":57,"quote":"Target audience: Agencies"}]}]},
      "industry":{"status":"confirmed","values":[{"value":"AI visibility software","evidence":[{"pageIndex":0,"pageUrl":"https://cohort-a.example.test/","contentField":"markdown","start":0,"end":31,"quote":"Industry: AI visibility software"}]}]},
      "keyUseCases":{"status":"unknown","reason":"no_supported_statement"},
      "capabilities":{"status":"unknown","reason":"no_supported_statement"},
      "geography":{"status":"unknown","reason":"no_supported_statement"}
    },
    "excludedPages":[]
  }'::jsonb),
  ('b', '{
    "methodVersion":"company-profile-v2",
    "fields":{
      "companyName":{"status":"unknown","reason":"no_supported_statement"},
      "productName":{"status":"unknown","reason":"no_supported_statement"},
      "shortDescription":{"status":"unknown","reason":"no_supported_statement"},
      "primaryProduct":{"status":"unknown","reason":"no_supported_statement"},
      "targetAudience":{"status":"unknown","reason":"no_supported_statement"},
      "industry":{"status":"confirmed","values":[{"value":"Analytics software","evidence":[{"pageIndex":0,"pageUrl":"https://cohort-b.example.test/","contentField":"markdown","start":0,"end":28,"quote":"Industry: Analytics software"}]}]},
      "keyUseCases":{"status":"unknown","reason":"no_supported_statement"},
      "capabilities":{"status":"unknown","reason":"no_supported_statement"},
      "geography":{"status":"unknown","reason":"no_supported_statement"}
    },
    "excludedPages":[]
  }'::jsonb);
grant select on table pg_temp.c6_profiles to service_role;

insert into public.company_profile_snapshots (
  id, workspace_id, project_id, idempotency_key, request_fingerprint,
  capture_method_version, captured_at, crawl_result,
  profile_method_version, profile
) values
  (
    'f4000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4100000-0000-4000-8000-000000000001',
    repeat('a', 64), 'native-entry-page-v1', now(),
    '{"ok":true,"pages":[{"url":"https://cohort-a.example.test/","markdown":"Industry: AI visibility software\nTarget audience: Agencies"}]}'::jsonb,
    'company-profile-v2', (select payload from pg_temp.c6_profiles where label = 'a')
  ),
  (
    'f4000000-0000-4000-8000-000000000002',
    'f2000000-0000-4000-8000-000000000002',
    'f3000000-0000-4000-8000-000000000002',
    'f4100000-0000-4000-8000-000000000002',
    repeat('b', 64), 'native-entry-page-v1', now(),
    '{"ok":true,"pages":[{"url":"https://cohort-b.example.test/","markdown":"Industry: Analytics software"}]}'::jsonb,
    'company-profile-v2', (select payload from pg_temp.c6_profiles where label = 'b')
  );

create temp table c6_results (
  label text primary key,
  payload jsonb not null
);
grant select, insert, update, delete on table pg_temp.c6_results to service_role;

select ok(has_function_privilege('service_role',
  'public.persist_prompt_cohort(uuid,uuid,uuid,uuid,jsonb,jsonb)', 'execute'),
  'service role can persist a prompt cohort through the narrow RPC');
select ok(not has_function_privilege('authenticated',
  'public.persist_prompt_cohort(uuid,uuid,uuid,uuid,jsonb,jsonb)', 'execute'),
  'authenticated callers cannot persist prompt cohorts');
select ok(not has_table_privilege('service_role', 'public.prompt_cohorts', 'insert'),
  'service role cannot bypass the persistence RPC with direct cohort inserts');
select ok(not has_table_privilege('authenticated', 'public.prompt_cohorts', 'insert'),
  'authenticated callers cannot directly insert cohorts');
select ok(has_table_privilege('authenticated', 'public.prompt_cohorts', 'select'),
  'authenticated callers have only the intended read grant');
select ok(not has_function_privilege('authenticated',
  'public.reserve_scan(uuid,uuid,uuid,text,text,jsonb)', 'execute'),
  'legacy caller-supplied scan query reservation is revoked');
select ok(has_function_privilege('authenticated',
  'public.reserve_scan_from_cohort(uuid,uuid,uuid,uuid)', 'execute'),
  'authenticated callers can reserve only from a durable cohort');

set local role service_role;
insert into pg_temp.c6_results (label, payload)
select 'a-primary', public.persist_prompt_cohort(
  'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000001',
  (select payload from pg_temp.c6_profiles where label = 'a'),
  '[
    {"queryId":"niche-prompts-v1:c6-category","category":"category-discovery","text":"Which tools are available for AI visibility software?","templateVersion":"category@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]}]},
    {"queryId":"niche-prompts-v1:c6-best","category":"best-tools-platforms","text":"What are the best AI visibility software tools for Agencies?","templateVersion":"best-audience@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]},{"field":"targetAudience","valueIndex":0,"evidenceIndexes":[0]}]},
    {"queryId":"niche-prompts-v1:c6-buyer","category":"buyer-intent","text":"What should Agencies look for in AI visibility software tools?","templateVersion":"buyer@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]},{"field":"targetAudience","valueIndex":0,"evidenceIndexes":[0]}]}
  ]'::jsonb
);
insert into pg_temp.c6_results (label, payload)
select 'a-duplicate', public.persist_prompt_cohort(
  'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000002',
  (select payload from pg_temp.c6_profiles where label = 'a'),
  '[
    {"queryId":"niche-prompts-v1:c6-category","category":"category-discovery","text":"Which tools are available for AI visibility software?","templateVersion":"category@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]}]},
    {"queryId":"niche-prompts-v1:c6-best","category":"best-tools-platforms","text":"What are the best AI visibility software tools for Agencies?","templateVersion":"best-audience@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]},{"field":"targetAudience","valueIndex":0,"evidenceIndexes":[0]}]},
    {"queryId":"niche-prompts-v1:c6-buyer","category":"buyer-intent","text":"What should Agencies look for in AI visibility software tools?","templateVersion":"buyer@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]},{"field":"targetAudience","valueIndex":0,"evidenceIndexes":[0]}]}
  ]'::jsonb
);
insert into pg_temp.c6_results (label, payload)
select 'a-empty', public.persist_prompt_cohort(
  'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000003',
  (select payload from pg_temp.c6_profiles where label = 'a'),
  '[]'::jsonb
);
insert into pg_temp.c6_results (label, payload)
select 'b-primary', public.persist_prompt_cohort(
  'f2000000-0000-4000-8000-000000000002',
  'f3000000-0000-4000-8000-000000000002',
  'f4000000-0000-4000-8000-000000000002',
  'f5000000-0000-4000-8000-000000000004',
  (select payload from pg_temp.c6_profiles where label = 'b'),
  '[{"queryId":"niche-prompts-v1:c6-b","category":"category-discovery","text":"Which tools are available for Analytics software?","templateVersion":"category@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]}]}]'::jsonb
);
reset role;

select is((select count(*) from public.prompt_cohorts), 4::bigint,
  'four immutable prompt cohort snapshots were persisted');
select is((select count(*) from public.prompt_cohort_queries), 7::bigint,
  'query rows preserve the exact planned prompts while zero-query cohorts stay empty');
select is((select query_count from public.prompt_cohorts
  where id = (select (payload ->> 'cohortId')::uuid from pg_temp.c6_results where label = 'a-empty')),
  0::smallint, 'sparse profiles can durably persist a zero-query cohort');
select is((select string_agg(query_id, ',' order by query_ordinal)
  from public.prompt_cohort_queries
  where cohort_id = (select (payload ->> 'cohortId')::uuid from pg_temp.c6_results where label = 'a-primary')),
  'niche-prompts-v1:c6-category,niche-prompts-v1:c6-best,niche-prompts-v1:c6-buyer',
  'prompt order and identity round-trip exactly');
select is((select evidence_refs from public.prompt_cohort_queries
  where cohort_id = (select (payload ->> 'cohortId')::uuid from pg_temp.c6_results where label = 'a-primary')
    and query_ordinal = 1),
  '[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]},{"field":"targetAudience","valueIndex":0,"evidenceIndexes":[0]}]'::jsonb,
  'prompt evidence references round-trip without interpretation');
select ok((select request_fingerprint ~ '^[0-9a-f]{64}$'
  from public.prompt_cohorts
  where id = (select (payload ->> 'cohortId')::uuid from pg_temp.c6_results where label = 'a-primary')),
  'database computes a stable lowercase SHA-256 cohort fingerprint');

set local role service_role;
select is(
  public.persist_prompt_cohort(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000001',
    (select payload from pg_temp.c6_profiles where label = 'a'),
    '[
      {"queryId":"niche-prompts-v1:c6-category","category":"category-discovery","text":"Which tools are available for AI visibility software?","templateVersion":"category@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]}]},
      {"queryId":"niche-prompts-v1:c6-best","category":"best-tools-platforms","text":"What are the best AI visibility software tools for Agencies?","templateVersion":"best-audience@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]},{"field":"targetAudience","valueIndex":0,"evidenceIndexes":[0]}]},
      {"queryId":"niche-prompts-v1:c6-buyer","category":"buyer-intent","text":"What should Agencies look for in AI visibility software tools?","templateVersion":"buyer@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]},{"field":"targetAudience","valueIndex":0,"evidenceIndexes":[0]}]}
    ]'::jsonb
  ) ->> 'replayed',
  'true', 'identical cohort replay is idempotent'
);
select throws_ok(
  $$select public.persist_prompt_cohort(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000001',
    (select payload from pg_temp.c6_profiles where label = 'a'),
    '[{"queryId":"niche-prompts-v1:changed","category":"category-discovery","text":"Changed","templateVersion":"category@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[0]}]}]'::jsonb
  )$$,
  '22023', 'Idempotency key reused with different prompt cohort',
  'same cohort idempotency key cannot be reused with changed prompts'
);
select throws_ok(
  $$select public.persist_prompt_cohort(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000010',
    jsonb_set((select payload from pg_temp.c6_profiles where label = 'a'), '{fields,industry,values,0,value}', '"Forged category"'::jsonb),
    '[]'::jsonb
  )$$,
  '22023', 'Profile payload does not match stored snapshot',
  'caller cannot pair generated prompts with a forged profile payload'
);
select throws_ok(
  $$select public.persist_prompt_cohort(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000002',
    'f5000000-0000-4000-8000-000000000011',
    (select payload from pg_temp.c6_profiles where label = 'b'),
    '[]'::jsonb
  )$$,
  '23503', 'Profile snapshot not found for prompt cohort',
  'cross-workspace profile snapshots cannot be attached to a cohort'
);
select throws_ok(
  $$select public.persist_prompt_cohort(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000012',
    (select payload from pg_temp.c6_profiles where label = 'a'),
    '[{"queryId":"niche-prompts-v1:bad-ref","category":"category-discovery","text":"Bad ref","templateVersion":"category@v1","language":"en","locale":null,"state":"planned","evidenceRefs":[{"field":"industry","valueIndex":0,"evidenceIndexes":[9]}]}]'::jsonb
  )$$,
  '22023', 'Invalid prompt evidence reference',
  'evidence indexes must resolve through the exact stored profile value'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.prompt_cohorts), 3::bigint,
  'workspace member reads only own prompt cohorts through RLS');
select throws_ok(
  $$insert into public.prompt_cohorts (
    workspace_id, project_id, profile_snapshot_id, idempotency_key,
    request_fingerprint, prompt_method_version, profile_method_version,
    language, locale, query_count
  ) values (
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000099',
    repeat('c', 64), 'niche-prompts-v1', 'company-profile-v2', 'en', null, 0
  )$$,
  '42501', null, 'authenticated callers cannot write cohort evidence directly'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.prompt_cohorts), 0::bigint,
  'nonmember reads no prompt cohorts');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.prompt_cohorts), 1::bigint,
  'second tenant reads only its own cohort');
reset role;

set local role anon;
select throws_ok($$select * from public.prompt_cohorts$$,
  '42501', null, 'anonymous callers have no prompt cohort table grant');
reset role;

select throws_ok(
  $$update public.prompt_cohorts set query_count = query_count where workspace_id = 'f2000000-0000-4000-8000-000000000001'$$,
  '22023', 'Prompt provenance rows are immutable',
  'cohort snapshots cannot be rewritten even through privileged setup paths'
);
select throws_ok(
  $$update public.prompt_cohort_queries set query_text = query_text where workspace_id = 'f2000000-0000-4000-8000-000000000001'$$,
  '22023', 'Prompt provenance rows are immutable',
  'prompt rows cannot be rewritten after persistence'
);

insert into app_private.scan_provider_configs (
  provider, model_id, price_version, currency,
  worst_case_cost_per_query_microunits, max_output_tokens,
  max_global_active_scans, enabled
) values ('gemini', 'gemini-c6-test', 'c6-price-v1', 'USD', 10, 2048, 10, true);
insert into app_private.workspace_scan_controls (
  workspace_id, provider, model_id, price_version, enabled,
  max_queries_per_scan, max_attempts_per_scan, max_concurrent_scans,
  max_scans_per_window, budget_window_start, budget_window_end, budget_microunits
) values (
  'f2000000-0000-4000-8000-000000000001', 'gemini', 'gemini-c6-test', 'c6-price-v1', true,
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

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select is(
  public.reserve_scan_from_cohort(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    (select (payload ->> 'cohortId')::uuid from pg_temp.c6_results where label = 'a-primary')
  ) ->> 'promptCohortId',
  (select payload ->> 'cohortId' from pg_temp.c6_results where label = 'a-primary'),
  'scan reservation returns the exact durable cohort identity'
);
select is((select count(*) from public.scan_queries
  where scan_id = (select scan_id from public.scan_prompt_cohorts
    where prompt_cohort_id = (select (payload ->> 'cohortId')::uuid from pg_temp.c6_results where label = 'a-primary'))),
  3::bigint, 'scan execution queries are copied atomically from the persisted cohort');
select is((select string_agg(scan_query.query_id, ',' order by scan_query.query_ordinal)
  from public.scan_queries scan_query
  join public.scan_prompt_cohorts mapping
    on mapping.workspace_id = scan_query.workspace_id
   and mapping.scan_id = scan_query.scan_id
  where mapping.prompt_cohort_id = (select (payload ->> 'cohortId')::uuid from pg_temp.c6_results where label = 'a-primary')),
  'niche-prompts-v1:c6-category,niche-prompts-v1:c6-best,niche-prompts-v1:c6-buyer',
  'scan query order cannot drift from the durable cohort');
select is(
  public.reserve_scan_from_cohort(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    (select (payload ->> 'cohortId')::uuid from pg_temp.c6_results where label = 'a-primary')
  ) ->> 'replayed',
  'true', 'scan reservation replay preserves its original cohort binding'
);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    (select (payload ->> 'cohortId')::uuid from pg_temp.c6_results where label = 'a-duplicate')
  )$$,
  '22023', 'Idempotency key reused with different scan prompt cohort',
  'scan idempotency cannot be rebound to another provenance cohort even with identical queries'
);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000002',
    (select (payload ->> 'cohortId')::uuid from pg_temp.c6_results where label = 'a-empty')
  )$$,
  'P0001', 'Prompt cohort has no executable queries',
  'zero-query cohorts are durable evidence but cannot reserve paid execution'
);
select throws_ok(
  $$select public.reserve_scan_from_cohort(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000003',
    (select (payload ->> 'cohortId')::uuid from pg_temp.c6_results where label = 'b-primary')
  )$$,
  '42501', 'Prompt cohort access required',
  'a cohort from another tenant cannot be attached to this scan'
);
reset role;

select is((select count(*) from public.scan_prompt_cohorts), 1::bigint,
  'each new cohort-backed scan receives one immutable provenance binding');
select throws_ok(
  $$update public.scan_prompt_cohorts set prompt_cohort_id = prompt_cohort_id$$,
  '22023', 'Prompt provenance rows are immutable',
  'scan-to-cohort bindings cannot be rewritten'
);

delete from public.projects
where workspace_id = 'f2000000-0000-4000-8000-000000000002'
  and id = 'f3000000-0000-4000-8000-000000000002';
select is((select count(*) from public.prompt_cohorts
  where workspace_id = 'f2000000-0000-4000-8000-000000000002'),
  0::bigint, 'deleting the owning project cascades prompt cohorts without orphans');
select is((select count(*) from public.prompt_cohort_queries
  where workspace_id = 'f2000000-0000-4000-8000-000000000002'),
  0::bigint, 'project cascade also removes prompt rows');

select * from finish();
rollback;
