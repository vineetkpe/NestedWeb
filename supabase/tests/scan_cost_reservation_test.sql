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

select ok(not has_table_privilege('authenticated', 'app_private.scan_provider_configs', 'select'),
  'authenticated callers cannot read provider pricing controls');
select ok(not has_table_privilege('authenticated', 'app_private.scan_cost_reservations', 'select'),
  'authenticated callers cannot read private cost ledger rows');
select ok(has_function_privilege('authenticated',
  'public.reserve_scan(uuid,uuid,uuid,text,text,jsonb)', 'execute'),
  'authenticated callers can enter only the bounded reservation RPC');
select ok(not has_function_privilege('authenticated',
  'public.settle_scan_reservation(uuid,uuid,uuid,bigint)', 'execute'),
  'authenticated callers cannot settle their own cost reservations');
select ok(has_function_privilege('service_role',
  'public.settle_scan_reservation(uuid,uuid,uuid,bigint)', 'execute'),
  'service worker role can use the narrow settlement RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.reserve_scan(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001',
    'niche-prompts-v1', 'company-profile-v2',
    '[{"queryId":"niche-prompts-v1:test-1","queryVersion":"category@v1","queryText":"Which tools are available?"}]'::jsonb
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
  public.reserve_scan(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001',
    'niche-prompts-v1', 'company-profile-v2',
    '[
      {"queryId":"niche-prompts-v1:test-1","queryVersion":"category@v1","queryText":"Which tools are available?"},
      {"queryId":"niche-prompts-v1:test-2","queryVersion":"buyer@v1","queryText":"What should buyers look for?"}
    ]'::jsonb
  ) ->> 'reservedMicrounits',
  '400',
  'worst-case reservation is queries times attempts times configured upper bound'
);
select is((select count(*) from public.scans), 1::bigint,
  'reservation atomically persists one scan');
select is((select count(*) from public.scan_queries), 2::bigint,
  'reservation atomically snapshots ordered queries');
select is(
  public.reserve_scan(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001',
    'niche-prompts-v1', 'company-profile-v2',
    '[
      {"queryId":"niche-prompts-v1:test-1","queryVersion":"category@v1","queryText":"Which tools are available?"},
      {"queryId":"niche-prompts-v1:test-2","queryVersion":"buyer@v1","queryText":"What should buyers look for?"}
    ]'::jsonb
  ) ->> 'replayed',
  'true',
  'same idempotency key and exact payload replays without new reservation'
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
  $$select public.reserve_scan(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001',
    'niche-prompts-v1', 'company-profile-v2',
    '[{"queryId":"niche-prompts-v1:changed","queryVersion":"category@v1","queryText":"Changed request"}]'::jsonb
  )$$,
  '22023', 'Idempotency key reused with different scan request',
  'idempotency key cannot be reused with a changed scan payload'
);
select throws_ok(
  $$select public.reserve_scan(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000002',
    'niche-prompts-v1', 'company-profile-v2',
    '[
      {"queryId":"niche-prompts-v1:a","queryVersion":"category@v1","queryText":"A"},
      {"queryId":"niche-prompts-v1:b","queryVersion":"buyer@v1","queryText":"B"},
      {"queryId":"niche-prompts-v1:c","queryVersion":"use-case@v1","queryText":"C"},
      {"queryId":"niche-prompts-v1:d","queryVersion":"alternatives@v1","queryText":"D"}
    ]'::jsonb
  )$$,
  'P0001', 'Scan query limit exceeded',
  'configured query limit fails closed before reserving cost'
);
select throws_ok(
  $$select public.reserve_scan(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000003',
    'niche-prompts-v1', 'company-profile-v2',
    '[{"queryId":"niche-prompts-v1:cross","queryVersion":"category@v1","queryText":"Cross tenant"}]'::jsonb
  )$$,
  '42501', null,
  'workspace member cannot reserve a scan for another tenant project'
);
select throws_ok($$select * from app_private.scan_cost_reservations$$,
  '42501', null, 'client cannot inspect private reservation ledger');

select is(
  public.reserve_scan(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000004',
    'niche-prompts-v1', 'company-profile-v2',
    '[{"queryId":"niche-prompts-v1:test-3","queryVersion":"category@v1","queryText":"One more question"}]'::jsonb
  ) ->> 'reservedMicrounits',
  '200', 'a second request reserves the remaining project budget'
);
select throws_ok(
  $$select public.reserve_scan(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000005',
    'niche-prompts-v1', 'company-profile-v2',
    '[{"queryId":"niche-prompts-v1:test-4","queryVersion":"category@v1","queryText":"Budget overflow"}]'::jsonb
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
  $$select public.reserve_scan(
    'c2000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000006',
    'niche-prompts-v1', 'company-profile-v2',
    '[{"queryId":"niche-prompts-v1:global","queryVersion":"category@v1","queryText":"Global concurrency"}]'::jsonb
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
  public.reserve_scan(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000007',
    'niche-prompts-v1', 'company-profile-v2',
    '[{"queryId":"niche-prompts-v1:after-release","queryVersion":"category@v1","queryText":"After release"}]'::jsonb
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
  public.reserve_scan(
    'c2000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000008',
    'niche-prompts-v1', 'company-profile-v2',
    '[{"queryId":"niche-prompts-v1:request-1","queryVersion":"category@v1","queryText":"First request"}]'::jsonb
  ) ->> 'reservedMicrounits',
  '200', 'first request inside the configured window is reserved'
);
select throws_ok(
  $$select public.reserve_scan(
    'c2000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000009',
    'niche-prompts-v1', 'company-profile-v2',
    '[{"queryId":"niche-prompts-v1:request-2","queryVersion":"category@v1","queryText":"Second request"}]'::jsonb
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
  $$select public.reserve_scan(
    'c2000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000010',
    'niche-prompts-v1', 'company-profile-v2',
    '[{"queryId":"niche-prompts-v1:disabled","queryVersion":"category@v1","queryText":"Provider disabled"}]'::jsonb
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
  $$select public.reserve_scan(
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000011',
    'niche-prompts-v1', 'company-profile-v2',
    '[{"queryId":"niche-prompts-v1:forged","queryVersion":"category@v1","queryText":"Forged metadata"}]'::jsonb
  )$$,
  '42501', null,
  'editable auth metadata cannot grant budget or workspace access'
);

select * from finish();
rollback;