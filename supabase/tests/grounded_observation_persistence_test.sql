-- Grounded observation/citation persistence fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'evidence-owner@example.test'),
  ('f1000000-0000-4000-8000-000000000002', 'evidence-outsider@example.test');

insert into public.workspaces (id, name, created_by) values
  ('f2000000-0000-4000-8000-000000000001', 'Evidence Agency', 'f1000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002', 'Other Agency', 'f1000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'owner'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'owner');
insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
   'Evidence Client', 'evidence.example.com', 'f1000000-0000-4000-8000-000000000001');

insert into app_private.scan_provider_configs (
  provider, model_id, price_version, currency,
  worst_case_cost_per_query_microunits, max_output_tokens,
  max_global_active_scans, enabled
) values ('gemini', 'gemini-evidence-test', 'evidence-price-v1', 'USD', 10, 2048, 10, true);

insert into app_private.workspace_scan_controls (
  workspace_id, provider, model_id, price_version, enabled,
  max_queries_per_scan, max_attempts_per_scan, max_concurrent_scans,
  max_scans_per_window, budget_window_start, budget_window_end, budget_microunits
) values (
  'f2000000-0000-4000-8000-000000000001', 'gemini', 'gemini-evidence-test', 'evidence-price-v1', true,
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

insert into public.scans (
  id, workspace_id, project_id, idempotency_key, request_fingerprint, state,
  prompt_method_version, profile_method_version, query_count, created_by
) values (
  'f4000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f4100000-0000-4000-8000-000000000001', repeat('a', 64), 'queued',
  'niche-prompts-v1', 'company-profile-v2', 1,
  'f1000000-0000-4000-8000-000000000001'
);
insert into public.scan_queries (
  workspace_id, scan_id, query_ordinal, query_id, query_version, query_text
) values (
  'f2000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001', 0,
  'niche-prompts-v1:evidence-test', 'category@v1',
  'Which tools are available for "AI visibility"?'
);
insert into app_private.scan_cost_reservations (
  id, workspace_id, project_id, scan_id, provider, model_id, price_version,
  currency, worst_case_cost_per_query_microunits, max_output_tokens,
  query_count, max_attempts, reserved_microunits, status,
  workspace_budget_window_start, workspace_budget_window_end,
  project_budget_window_start, project_budget_window_end
) values (
  'f4200000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'gemini', 'gemini-evidence-test', 'evidence-price-v1', 'USD', 10, 2048,
  1, 2, 10, 'reserved',
  now() - interval '1 hour', now() + interval '1 hour',
  now() - interval '1 hour', now() + interval '1 hour'
);

create temp table c7a_fixture (
  label text primary key,
  payload jsonb
);
grant select, insert, update, delete on table pg_temp.c7a_fixture to service_role;

select ok(not has_table_privilege('authenticated', 'public.raw_observations', 'insert'),
  'authenticated callers cannot insert raw observations');
select ok(not has_table_privilege('authenticated', 'public.raw_citations', 'insert'),
  'authenticated callers cannot insert raw citations');
select ok(not has_table_privilege('service_role', 'public.raw_observations', 'insert'),
  'service role cannot bypass the observation RPC with direct inserts');
select ok(not has_table_privilege('service_role', 'public.raw_citations', 'insert'),
  'service role cannot bypass the citation RPC with direct inserts');
select ok(not has_function_privilege('authenticated',
  'public.persist_grounded_observation(uuid,uuid,uuid,uuid,uuid,integer,jsonb)', 'execute'),
  'authenticated callers cannot persist provider evidence');
select ok(has_function_privilege('service_role',
  'public.persist_grounded_observation(uuid,uuid,uuid,uuid,uuid,integer,jsonb)', 'execute'),
  'service role can persist evidence through the narrow RPC');

set local role service_role;
insert into pg_temp.c7a_fixture (label, payload)
select 'claim', public.claim_scan_work('f5000000-0000-4000-8000-000000000001', 120);
select ok((select payload is not null from pg_temp.c7a_fixture where label = 'claim'),
  'worker claims the queued scan');
select is((select jsonb_array_length(payload -> 'queries') from pg_temp.c7a_fixture where label = 'claim'),
  1, 'claim returns one canonical query observation identity');

reset role;
insert into pg_temp.c7a_fixture (label, payload)
select 'observation', jsonb_build_object(
  'observationId', (select payload -> 'queries' -> 0 ->> 'observationId' from pg_temp.c7a_fixture where label = 'claim'),
  'queryId', 'niche-prompts-v1:evidence-test',
  'queryVersion', 'category@v1',
  'queryText', 'Which tools are available for "AI visibility"?',
  'provider', 'gemini',
  'surface', 'api',
  'captureVersion', 'gemini-generate-content-v1',
  'captureMode', 'injected_transport',
  'requestedModel', 'gemini-evidence-test',
  'modelVersion', 'gemini-evidence-test-001',
  'providerResponseId', 'fixture-response-1',
  'observedAt', '2026-09-12T14:05:00.000Z',
  'rawResponse', '{"fixture":true}',
  'responseDigest', 'sha256:' || encode(
    extensions.digest(convert_to('{"fixture":true}', 'UTF8'), 'sha256'), 'hex'
  ),
  'rawResponseState', 'complete',
  'outcome', 'answered',
  'failureCode', null,
  'answerText', 'Example answer with source evidence.',
  'finishReason', 'STOP',
  'groundingMetadata', jsonb_build_object(
    'groundingChunks', jsonb_build_array(
      jsonb_build_object('web', jsonb_build_object('uri', 'https://example.com/a', 'title', 'First')),
      jsonb_build_object('other', true),
      jsonb_build_object('web', jsonb_build_object('uri', 'https://example.com/a', 'title', 'Second')),
      jsonb_build_object('web', jsonb_build_object('uri', 'javascript:alert(1)', 'title', 'Unsafe'))
    )
  ),
  'citations', jsonb_build_array(
    jsonb_build_object(
      'citationId', (select payload -> 'queries' -> 0 ->> 'observationId' from pg_temp.c7a_fixture where label = 'claim') || ':grounding:0',
      'observationId', (select payload -> 'queries' -> 0 ->> 'observationId' from pg_temp.c7a_fixture where label = 'claim'),
      'citedUrl', 'https://example.com/a', 'sourceTitle', 'First',
      'capturedAt', '2026-09-12T14:05:00.000Z',
      'relationship', 'source_list_only', 'verification', 'not_checked',
      'groundingChunkIndex', 0, 'urlStatus', 'eligible',
      'sourceDomain', 'example.com', 'exclusionReason', null
    ),
    jsonb_build_object(
      'citationId', (select payload -> 'queries' -> 0 ->> 'observationId' from pg_temp.c7a_fixture where label = 'claim') || ':grounding:2',
      'observationId', (select payload -> 'queries' -> 0 ->> 'observationId' from pg_temp.c7a_fixture where label = 'claim'),
      'citedUrl', 'https://example.com/a', 'sourceTitle', 'Second',
      'capturedAt', '2026-09-12T14:05:00.000Z',
      'relationship', 'source_list_only', 'verification', 'not_checked',
      'groundingChunkIndex', 2, 'urlStatus', 'eligible',
      'sourceDomain', 'example.com', 'exclusionReason', null
    ),
    jsonb_build_object(
      'citationId', (select payload -> 'queries' -> 0 ->> 'observationId' from pg_temp.c7a_fixture where label = 'claim') || ':grounding:3',
      'observationId', (select payload -> 'queries' -> 0 ->> 'observationId' from pg_temp.c7a_fixture where label = 'claim'),
      'citedUrl', 'javascript:alert(1)', 'sourceTitle', 'Unsafe',
      'capturedAt', '2026-09-12T14:05:00.000Z',
      'relationship', 'source_list_only', 'verification', 'not_checked',
      'groundingChunkIndex', 3, 'urlStatus', 'excluded',
      'sourceDomain', null, 'exclusionReason', 'unsafe_url'
    )
  )
);

grant select on table pg_temp.c7a_fixture to service_role;
set local role service_role;
insert into pg_temp.c7a_fixture (label, payload)
select 'persisted', public.persist_grounded_observation(
  (select (payload ->> 'workspaceId')::uuid from pg_temp.c7a_fixture where label = 'claim'),
  (select (payload ->> 'scanId')::uuid from pg_temp.c7a_fixture where label = 'claim'),
  (select (payload ->> 'attemptId')::uuid from pg_temp.c7a_fixture where label = 'claim'),
  'f5000000-0000-4000-8000-000000000001',
  (select (payload ->> 'leaseToken')::uuid from pg_temp.c7a_fixture where label = 'claim'),
  0,
  (select payload from pg_temp.c7a_fixture where label = 'observation')
);
select is((select payload ->> 'state' from pg_temp.c7a_fixture where label = 'persisted'),
  'answered', 'persisted observation returns the terminal query state');
select is((select payload ->> 'citationCount' from pg_temp.c7a_fixture where label = 'persisted'),
  '3', 'persistence returns exact citation occurrence count');
select is((select payload ->> 'replayed' from pg_temp.c7a_fixture where label = 'persisted'),
  'false', 'first persistence is not a replay');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.raw_observations), 1::bigint,
  'one immutable raw observation is stored');
select is((select count(*) from public.raw_citations), 3::bigint,
  'three citation occurrences are stored');
select is((select count(*) from public.raw_citations where cited_url = 'https://example.com/a'),
  2::bigint, 'duplicate URLs remain separate citation occurrences');
select is((select count(*) from public.raw_citations
  where url_status = 'excluded' and source_domain is null and exclusion_reason = 'unsafe_url'),
  1::bigint, 'unsafe citation remains explicit excluded evidence');
select is((select raw_response from public.raw_observations), '{"fixture":true}',
  'exact raw response text is retained');
select is((select response_digest from public.raw_observations),
  'sha256:' || encode(extensions.digest(convert_to('{"fixture":true}', 'UTF8'), 'sha256'), 'hex'),
  'stored digest matches the exact raw response');
select is((select state from public.scan_attempt_queries
  where scan_id = 'f4000000-0000-4000-8000-000000000001'),
  'answered', 'only the claimed attempt query advances to answered');

reset role;
set local role service_role;
insert into pg_temp.c7a_fixture (label, payload)
select 'replay', public.persist_grounded_observation(
  (select (payload ->> 'workspaceId')::uuid from pg_temp.c7a_fixture where label = 'claim'),
  (select (payload ->> 'scanId')::uuid from pg_temp.c7a_fixture where label = 'claim'),
  (select (payload ->> 'attemptId')::uuid from pg_temp.c7a_fixture where label = 'claim'),
  'f5000000-0000-4000-8000-000000000001',
  (select (payload ->> 'leaseToken')::uuid from pg_temp.c7a_fixture where label = 'claim'),
  0,
  (select payload from pg_temp.c7a_fixture where label = 'observation')
);
select is((select payload ->> 'replayed' from pg_temp.c7a_fixture where label = 'replay'),
  'true', 'identical evidence replay is idempotent');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.raw_citations), 3::bigint,
  'idempotent replay does not duplicate citations');

reset role;
set local role service_role;
select throws_ok(
  format(
    'select public.persist_grounded_observation(%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid,0,%L::jsonb)',
    (select payload ->> 'workspaceId' from pg_temp.c7a_fixture where label = 'claim'),
    (select payload ->> 'scanId' from pg_temp.c7a_fixture where label = 'claim'),
    (select payload ->> 'attemptId' from pg_temp.c7a_fixture where label = 'claim'),
    'f5000000-0000-4000-8000-000000000001',
    (select payload ->> 'leaseToken' from pg_temp.c7a_fixture where label = 'claim'),
    ((select payload from pg_temp.c7a_fixture where label = 'observation') || '{"answerText":"Changed answer"}'::jsonb)::text
  ),
  '22023', 'Observation replay conflicts with stored evidence',
  'same observation UUID cannot be replayed with altered evidence'
);

select throws_ok(
  format(
    'select public.persist_grounded_observation(%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid,0,%L::jsonb)',
    (select payload ->> 'workspaceId' from pg_temp.c7a_fixture where label = 'claim'),
    (select payload ->> 'scanId' from pg_temp.c7a_fixture where label = 'claim'),
    (select payload ->> 'attemptId' from pg_temp.c7a_fixture where label = 'claim'),
    'f5000000-0000-4000-8000-000000000001',
    'f6000000-0000-4000-8000-000000000099',
    (select payload::text from pg_temp.c7a_fixture where label = 'observation')
  ),
  'P0001', 'Scan lease not found',
  'forged lease token cannot persist evidence'
);

select throws_ok(
  format(
    'select public.persist_grounded_observation(%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid,0,%L::jsonb)',
    (select payload ->> 'workspaceId' from pg_temp.c7a_fixture where label = 'claim'),
    (select payload ->> 'scanId' from pg_temp.c7a_fixture where label = 'claim'),
    (select payload ->> 'attemptId' from pg_temp.c7a_fixture where label = 'claim'),
    'f5000000-0000-4000-8000-000000000001',
    (select payload ->> 'leaseToken' from pg_temp.c7a_fixture where label = 'claim'),
    ((select payload from pg_temp.c7a_fixture where label = 'observation') || '{"requestedModel":"gemini-forged"}'::jsonb)::text
  ),
  '22023', 'Grounded observation identity mismatch',
  'provider model must match the reserved model'
);

select throws_ok(
  format(
    'select public.persist_grounded_observation(%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid,0,%L::jsonb)',
    (select payload ->> 'workspaceId' from pg_temp.c7a_fixture where label = 'claim'),
    (select payload ->> 'scanId' from pg_temp.c7a_fixture where label = 'claim'),
    (select payload ->> 'attemptId' from pg_temp.c7a_fixture where label = 'claim'),
    'f5000000-0000-4000-8000-000000000001',
    (select payload ->> 'leaseToken' from pg_temp.c7a_fixture where label = 'claim'),
    ((select payload from pg_temp.c7a_fixture where label = 'observation') || jsonb_build_object('responseDigest', 'sha256:' || repeat('0', 64)))::text
  ),
  '22023', 'Raw response digest mismatch',
  'database recomputes and rejects a forged raw-response digest'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.raw_observations), 1::bigint,
  'workspace member can read the stored observation');
select is((select count(*) from public.raw_citations), 3::bigint,
  'workspace member can read citation occurrences');
select throws_ok(
  $$insert into public.raw_observations (
    workspace_id, project_id, scan_id, attempt_id, query_ordinal, observation_id,
    query_id, query_version, query_text, provider, surface, capture_version,
    capture_mode, requested_model, observed_at, raw_response_state, outcome,
    failure_code, observation_fingerprint
  ) values (
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    'f4300000-0000-4000-8000-000000000001', 0,
    'f7000000-0000-4000-8000-000000000099',
    'forged', 'forged', 'forged', 'gemini', 'api', 'gemini-generate-content-v1',
    'not_executed', 'gemini-evidence-test', now(), 'not_received', 'failed',
    'provider_error', repeat('0',64)
  )$$,
  '42501', null,
  'browser role cannot directly insert raw observations'
);

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.raw_observations), 0::bigint,
  'nonmember cannot read another workspace observation');
select is((select count(*) from public.raw_citations), 0::bigint,
  'nonmember cannot read another workspace citations');

reset role;
update app_private.scan_worker_leases
set heartbeat_at = claimed_at,
    lease_expires_at = claimed_at + interval '1 millisecond'
where workspace_id = 'f2000000-0000-4000-8000-000000000001'
  and scan_id = 'f4000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok(
  format(
    'select public.persist_grounded_observation(%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid,0,%L::jsonb)',
    (select payload ->> 'workspaceId' from pg_temp.c7a_fixture where label = 'claim'),
    (select payload ->> 'scanId' from pg_temp.c7a_fixture where label = 'claim'),
    (select payload ->> 'attemptId' from pg_temp.c7a_fixture where label = 'claim'),
    'f5000000-0000-4000-8000-000000000001',
    (select payload ->> 'leaseToken' from pg_temp.c7a_fixture where label = 'claim'),
    (select payload::text from pg_temp.c7a_fixture where label = 'observation')
  ),
  'P0001', 'Scan lease expired',
  'expired worker lease cannot write or replay evidence'
);

reset role;
select * from finish();
rollback;