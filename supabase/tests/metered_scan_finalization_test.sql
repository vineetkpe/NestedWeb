-- C7b metered completion fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'meter-owner@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'meter-outsider@example.test');
insert into public.workspaces (id, name, created_by) values
  ('a2000000-0000-4000-8000-000000000001', 'Meter Agency', 'a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002', 'Meter Other', 'a1000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'owner');
insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
   'Meter Client', 'meter.example.test', 'a1000000-0000-4000-8000-000000000001');

insert into app_private.scan_provider_configs (
  provider, model_id, price_version, currency,
  worst_case_cost_per_query_microunits, max_output_tokens,
  max_global_active_scans, enabled
) values ('gemini', 'gemini-meter-test', 'meter-price-v1', 'USD', 100, 2048, 10, true);
insert into app_private.scan_provider_metering_configs (
  provider, model_id, price_version,
  input_microunits_per_million_tokens,
  output_microunits_per_million_tokens,
  search_microunits_per_thousand_queries
) values ('gemini', 'gemini-meter-test', 'meter-price-v1', 1000000, 2000000, 1000);

create function pg_temp.make_meter_scan(
  p_scan_id uuid,
  p_attempt_id uuid,
  p_observation_id uuid,
  p_reservation_id uuid,
  p_lease_token uuid,
  p_raw_response text,
  p_grounding jsonb,
  p_query_state text default 'answered',
  p_attempt_number integer default 1,
  p_max_attempts integer default 1,
  p_reserved bigint default 100
)
returns void
language plpgsql
as $$
begin
  insert into public.scans (
    id, workspace_id, project_id, idempotency_key, request_fingerprint, state,
    prompt_method_version, profile_method_version, query_count, created_by
  ) values (
    p_scan_id, 'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001', gen_random_uuid(), repeat('a',64), 'running',
    'niche-prompts-v1', 'company-profile-v2', 1, 'a1000000-0000-4000-8000-000000000001'
  );
  insert into public.scan_queries (
    workspace_id, scan_id, query_ordinal, query_id, query_version, query_text
  ) values (
    'a2000000-0000-4000-8000-000000000001', p_scan_id, 0,
    'niche-prompts-v1:meter', 'category@v1', 'Which tools are available?'
  );
  insert into public.scan_attempts (
    id, workspace_id, scan_id, attempt_number, state, started_at
  ) values (
    p_attempt_id, 'a2000000-0000-4000-8000-000000000001', p_scan_id,
    p_attempt_number, 'running', now() - interval '1 second'
  );
  insert into public.scan_attempt_queries (
    workspace_id, scan_id, attempt_id, query_ordinal, observation_id, state
  ) values (
    'a2000000-0000-4000-8000-000000000001', p_scan_id, p_attempt_id, 0,
    p_observation_id, p_query_state
  );
  insert into app_private.scan_cost_reservations (
    id, workspace_id, project_id, scan_id, provider, model_id, price_version,
    currency, worst_case_cost_per_query_microunits, max_output_tokens,
    query_count, max_attempts, reserved_microunits, status,
    workspace_budget_window_start, workspace_budget_window_end,
    project_budget_window_start, project_budget_window_end
  ) values (
    p_reservation_id, 'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001', p_scan_id,
    'gemini', 'gemini-meter-test', 'meter-price-v1', 'USD', 100, 2048,
    1, p_max_attempts, p_reserved, 'reserved',
    now() - interval '1 hour', now() + interval '1 hour',
    now() - interval '1 hour', now() + interval '1 hour'
  );
  insert into app_private.scan_worker_leases (
    workspace_id, scan_id, attempt_id, worker_id, lease_token,
    claimed_at, heartbeat_at, lease_expires_at
  ) values (
    'a2000000-0000-4000-8000-000000000001', p_scan_id, p_attempt_id,
    'a5000000-0000-4000-8000-000000000001', p_lease_token,
    now(), now(), now() + interval '2 minutes'
  );
  if p_raw_response is not null then
    insert into public.raw_observations (
      workspace_id, project_id, scan_id, attempt_id, query_ordinal, observation_id,
      query_id, query_version, query_text, provider, surface, capture_version,
      capture_mode, requested_model, model_version, provider_response_id,
      observed_at, raw_response, response_digest, raw_response_state, outcome,
      failure_code, answer_text, finish_reason, grounding_metadata,
      observation_fingerprint
    ) values (
      'a2000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001', p_scan_id, p_attempt_id, 0,
      p_observation_id, 'niche-prompts-v1:meter', 'category@v1',
      'Which tools are available?', 'gemini', 'api', 'gemini-generate-content-v1',
      'injected_transport', 'gemini-meter-test', 'gemini-meter-test-001', 'meter-response',
      '2026-09-12T14:45:00.000Z', p_raw_response,
      'sha256:' || encode(extensions.digest(convert_to(p_raw_response,'UTF8'),'sha256'),'hex'),
      'complete', case when p_query_state = 'refused' then 'refused' else 'answered' end,
      null, case when p_query_state = 'refused' then null else 'Answer' end, 'STOP', p_grounding,
      encode(extensions.digest(convert_to(p_raw_response || p_observation_id::text,'UTF8'),'sha256'),'hex')
    );
  end if;
end;
$$;

select pg_temp.make_meter_scan(
  'a4000000-0000-4000-8000-000000000001',
  'a4100000-0000-4000-8000-000000000001',
  'a4200000-0000-4000-8000-000000000001',
  'a4300000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001',
  '{"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"thoughtsTokenCount":2,"toolUsePromptTokenCount":3,"totalTokenCount":20}}',
  '{"webSearchQueries":["alpha","alpha",""," beta ","beta"]}'::jsonb
);

select ok(not has_function_privilege('authenticated',
  'public.complete_scan_work(uuid,uuid,uuid,uuid,uuid)', 'execute'),
  'browser role cannot complete or settle scan work');
select ok(has_function_privilege('service_role',
  'public.complete_scan_work(uuid,uuid,uuid,uuid,uuid)', 'execute'),
  'service role can complete leased scan work through the narrow RPC');
select ok(not has_table_privilege('service_role', 'public.raw_observation_usage', 'insert'),
  'service role cannot directly forge parsed usage');
select ok(not has_table_privilege('service_role', 'public.scan_metering_summaries', 'insert'),
  'service role cannot directly forge scan metering summaries');

set local role service_role;
create temp table c7b_results(label text primary key, payload jsonb);
grant select, insert, update, delete on table pg_temp.c7b_results to service_role;
insert into pg_temp.c7b_results(label,payload)
select 'complete', public.complete_scan_work(
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'a4100000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001'
);
select is((select payload ->> 'state' from pg_temp.c7b_results where label='complete'),
  'completed', 'all answered evidence completes the scan');
select is((select payload ->> 'settledMicrounits' from pg_temp.c7b_results where label='complete'),
  '26', 'database computes gross list-price cost from provider usage and search queries');
select is((select payload ->> 'costBasis' from pg_temp.c7b_results where label='complete'),
  'gross_list_price', 'settlement explicitly records gross list-price cost basis');
select is((select payload ->> 'replayed' from pg_temp.c7b_results where label='complete'),
  'false', 'first completion is not a replay');

reset role;
select is((select state from public.scans where id='a4000000-0000-4000-8000-000000000001'),
  'completed', 'scan row is terminally completed');
select is((select state from public.scan_attempts where id='a4100000-0000-4000-8000-000000000001'),
  'completed', 'attempt row is terminally completed');
select is((select count(*) from app_private.scan_worker_leases
  where scan_id='a4000000-0000-4000-8000-000000000001'), 0::bigint,
  'completion releases the worker lease');
select is((select status from app_private.scan_cost_reservations
  where scan_id='a4000000-0000-4000-8000-000000000001'), 'settled',
  'reservation becomes settled');
select is((select settled_microunits from app_private.scan_cost_reservations
  where scan_id='a4000000-0000-4000-8000-000000000001'), 26::bigint,
  'worker never supplies the settlement amount');
select is((select prompt_token_count from public.raw_observation_usage
  where observation_id='a4200000-0000-4000-8000-000000000001'), 10::bigint,
  'prompt tokens are derived from exact raw provider response');
select is((select candidates_token_count + thoughts_token_count from public.raw_observation_usage
  where observation_id='a4200000-0000-4000-8000-000000000001'), 7::bigint,
  'visible candidate and thinking output tokens are retained separately');
select is((select search_query_count from public.raw_observation_usage
  where observation_id='a4200000-0000-4000-8000-000000000001'), 2,
  'duplicate and empty search queries do not inflate query billing count');
select is((select gross_cost_microunits from public.raw_observation_usage
  where observation_id='a4200000-0000-4000-8000-000000000001'), 26::bigint,
  'per-observation gross cost is durable');

set local role service_role;
insert into pg_temp.c7b_results(label,payload)
select 'replay', public.complete_scan_work(
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'a4100000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001'
);
select is((select payload ->> 'replayed' from pg_temp.c7b_results where label='replay'),
  'true', 'identical completion replay is idempotent after lease release');
select is((select payload ->> 'settledMicrounits' from pg_temp.c7b_results where label='replay'),
  '26', 'completion replay returns original settlement');

reset role;
select pg_temp.make_meter_scan(
  'a4000000-0000-4000-8000-000000000002',
  'a4100000-0000-4000-8000-000000000002',
  'a4200000-0000-4000-8000-000000000002',
  'a4300000-0000-4000-8000-000000000002',
  'a6000000-0000-4000-8000-000000000002',
  '{"usageMetadata":{"promptTokenCount":1.5,"candidatesTokenCount":1}}',
  '{"webSearchQueries":[]}'::jsonb
);
set local role service_role;
select throws_ok(
  $$select public.complete_scan_work(
    'a2000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000002',
    'a4100000-0000-4000-8000-000000000002',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000002')$$,
  '22023', 'Invalid Gemini usage metadata',
  'fractional provider usage is rejected instead of guessed'
);

reset role;
select pg_temp.make_meter_scan(
  'a4000000-0000-4000-8000-000000000003',
  'a4100000-0000-4000-8000-000000000003',
  'a4200000-0000-4000-8000-000000000003',
  'a4300000-0000-4000-8000-000000000003',
  'a6000000-0000-4000-8000-000000000003',
  null, null, 'answered'
);
set local role service_role;
select throws_ok(
  $$select public.complete_scan_work(
    'a2000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000003',
    'a4100000-0000-4000-8000-000000000003',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Scan evidence incomplete',
  'scan cannot complete when a terminal query lacks durable C7a evidence'
);

reset role;
select pg_temp.make_meter_scan(
  'a4000000-0000-4000-8000-000000000004',
  'a4100000-0000-4000-8000-000000000004',
  'a4200000-0000-4000-8000-000000000004',
  'a4300000-0000-4000-8000-000000000004',
  'a6000000-0000-4000-8000-000000000004',
  '{"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"thoughtsTokenCount":2}}',
  '{"webSearchQueries":["alpha","beta"]}'::jsonb,
  'answered', 2, 2, 200
);
insert into public.scan_attempts (
  id, workspace_id, scan_id, attempt_number, state, started_at, finished_at
) values (
  'a4100000-0000-4000-8000-000000000104',
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000004', 1, 'failed',
  now() - interval '2 minutes', now() - interval '1 minute'
);
insert into public.scan_attempt_queries (
  workspace_id, scan_id, attempt_id, query_ordinal, observation_id, state
) values (
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000004',
  'a4100000-0000-4000-8000-000000000104', 0,
  'a4200000-0000-4000-8000-000000000104', 'failed'
);
set local role service_role;
insert into pg_temp.c7b_results(label,payload)
select 'conservative', public.complete_scan_work(
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000004',
  'a4100000-0000-4000-8000-000000000004',
  'a5000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000004'
);
select is((select payload ->> 'settledMicrounits' from pg_temp.c7b_results where label='conservative'),
  '126', 'unobserved prior attempt is conservatively charged at reserved worst case');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.raw_observation_usage), 2::bigint,
  'workspace owner can read its durable usage evidence');
select is((select count(*) from public.scan_metering_summaries), 2::bigint,
  'workspace owner can read its metering summaries');
select throws_ok(
  $$delete from public.raw_observation_usage$$,
  '42501', null,
  'browser role cannot mutate metering evidence'
);
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.raw_observation_usage), 0::bigint,
  'nonmember cannot read another workspace usage evidence');
select is((select count(*) from public.scan_metering_summaries), 0::bigint,
  'nonmember cannot read another workspace metering summary');

reset role;
select * from finish();
rollback;