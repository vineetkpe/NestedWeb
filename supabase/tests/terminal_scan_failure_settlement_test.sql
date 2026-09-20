-- C7b terminal failure settlement fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'terminal-owner@example.test');
insert into public.workspaces (id, name, created_by) values
  ('b2000000-0000-4000-8000-000000000001', 'Terminal Agency', 'b1000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'owner');
insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
   'Terminal Client', 'terminal.example.test', 'b1000000-0000-4000-8000-000000000001');

insert into app_private.scan_provider_configs (
  provider, model_id, price_version, currency,
  worst_case_cost_per_query_microunits, max_output_tokens,
  max_global_active_scans, enabled
) values ('gemini', 'gemini-terminal-test', 'terminal-price-v1', 'USD', 100, 2048, 10, true);
insert into app_private.scan_provider_metering_configs (
  provider, model_id, price_version,
  input_microunits_per_million_tokens,
  output_microunits_per_million_tokens,
  search_microunits_per_thousand_queries
) values ('gemini', 'gemini-terminal-test', 'terminal-price-v1', 1000000, 2000000, 1000);

create function pg_temp.make_terminal_scan(
  p_scan_id uuid,
  p_attempt_id uuid,
  p_observation_id uuid,
  p_reservation_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_expired boolean default false
)
returns void
language plpgsql
as $$
begin
  insert into public.scans (
    id, workspace_id, project_id, idempotency_key, request_fingerprint, state,
    prompt_method_version, profile_method_version, query_count, created_by
  ) values (
    p_scan_id, 'b2000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001', gen_random_uuid(), repeat('b',64), 'running',
    'niche-prompts-v1', 'company-profile-v2', 1, 'b1000000-0000-4000-8000-000000000001'
  );
  insert into public.scan_queries (
    workspace_id, scan_id, query_ordinal, query_id, query_version, query_text
  ) values (
    'b2000000-0000-4000-8000-000000000001', p_scan_id, 0,
    'niche-prompts-v1:terminal', 'category@v1', 'Which terminal tools are available?'
  );
  insert into public.scan_attempts (
    id, workspace_id, scan_id, attempt_number, state, started_at
  ) values (
    p_attempt_id, 'b2000000-0000-4000-8000-000000000001', p_scan_id,
    1, 'running', now() - interval '1 second'
  );
  insert into public.scan_attempt_queries (
    workspace_id, scan_id, attempt_id, query_ordinal, observation_id, state
  ) values (
    'b2000000-0000-4000-8000-000000000001', p_scan_id, p_attempt_id, 0,
    p_observation_id, 'running'
  );
  insert into app_private.scan_cost_reservations (
    id, workspace_id, project_id, scan_id, provider, model_id, price_version,
    currency, worst_case_cost_per_query_microunits, max_output_tokens,
    query_count, max_attempts, reserved_microunits, status,
    workspace_budget_window_start, workspace_budget_window_end,
    project_budget_window_start, project_budget_window_end
  ) values (
    p_reservation_id, 'b2000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001', p_scan_id,
    'gemini', 'gemini-terminal-test', 'terminal-price-v1', 'USD', 100, 2048,
    1, 1, 100, 'reserved',
    now() - interval '1 hour', now() + interval '1 hour',
    now() - interval '1 hour', now() + interval '1 hour'
  );
  insert into app_private.scan_worker_leases (
    workspace_id, scan_id, attempt_id, worker_id, lease_token,
    claimed_at, heartbeat_at, lease_expires_at
  ) values (
    'b2000000-0000-4000-8000-000000000001', p_scan_id, p_attempt_id,
    p_worker_id, p_lease_token,
    case when p_expired then now() - interval '2 seconds' else now() end,
    case when p_expired then now() - interval '2 seconds' else now() end,
    case when p_expired then now() - interval '1 second' else now() + interval '2 minutes' end
  );
end;
$$;

create temp table terminal_results(label text primary key, payload jsonb);
grant select, insert, update, delete on table pg_temp.terminal_results to service_role;

select pg_temp.make_terminal_scan(
  'b4000000-0000-4000-8000-000000000001',
  'b4100000-0000-4000-8000-000000000001',
  'b4200000-0000-4000-8000-000000000001',
  'b4300000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001',
  'b6000000-0000-4000-8000-000000000001',
  false
);

set local role service_role;
insert into pg_temp.terminal_results(label, payload)
select 'explicit', public.retry_scan_work(
  'b2000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  'b4100000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001',
  'b6000000-0000-4000-8000-000000000001'
);
select is((select payload ->> 'nextState' from pg_temp.terminal_results where label='explicit'),
  'failed', 'explicit final retry terminally fails the scan');
select is((select payload ->> 'retryScheduled' from pg_temp.terminal_results where label='explicit'),
  'false', 'explicit final retry does not schedule more work');

reset role;
select is((select status from app_private.scan_cost_reservations
  where scan_id='b4000000-0000-4000-8000-000000000001'), 'settled',
  'explicit terminal retry settles the reservation');
select is((select settled_microunits from app_private.scan_cost_reservations
  where scan_id='b4000000-0000-4000-8000-000000000001'), 100::bigint,
  'explicit terminal retry conservatively charges the unobserved query');
select is((select unobserved_query_count from public.scan_metering_summaries
  where scan_id='b4000000-0000-4000-8000-000000000001'), 1::smallint,
  'terminal settlement records one unobserved query');
select is((select state from public.scans
  where id='b4000000-0000-4000-8000-000000000001'), 'failed',
  'explicit terminal retry leaves the scan failed');
select is((select count(*) from app_private.scan_worker_leases
  where scan_id='b4000000-0000-4000-8000-000000000001'), 0::bigint,
  'explicit terminal retry releases the lease');

select pg_temp.make_terminal_scan(
  'b4000000-0000-4000-8000-000000000002',
  'b4100000-0000-4000-8000-000000000002',
  'b4200000-0000-4000-8000-000000000002',
  'b4300000-0000-4000-8000-000000000002',
  'b5000000-0000-4000-8000-000000000002',
  'b6000000-0000-4000-8000-000000000002',
  true
);

set local role service_role;
select is(
  public.claim_scan_work('b5000000-0000-4000-8000-000000000099', 60),
  null::jsonb,
  'claim pass recovers an expired final lease without claiming unrelated work'
);

reset role;
select is((select state from public.scan_attempts
  where id='b4100000-0000-4000-8000-000000000002'), 'failed',
  'expired final attempt is marked failed during recovery');
select is((select state from public.scans
  where id='b4000000-0000-4000-8000-000000000002'), 'failed',
  'expired final lease terminally fails the scan');
select is((select status from app_private.scan_cost_reservations
  where scan_id='b4000000-0000-4000-8000-000000000002'), 'settled',
  'expired final lease settles the reservation before deletion');
select is((select settled_microunits from app_private.scan_cost_reservations
  where scan_id='b4000000-0000-4000-8000-000000000002'), 100::bigint,
  'expired final lease conservatively charges the unobserved query');
select is((select settlement_key from app_private.scan_cost_reservations
  where scan_id='b4000000-0000-4000-8000-000000000002')::text,
  'b6000000-0000-4000-8000-000000000002',
  'expired recovery settlement remains bound to the exact lease token');
select is((select count(*) from app_private.scan_worker_leases
  where scan_id='b4000000-0000-4000-8000-000000000002'), 0::bigint,
  'expired terminal recovery deletes the lease after settlement');

select * from finish();
rollback;
