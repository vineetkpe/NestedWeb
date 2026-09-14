-- D4b recommendation persistence fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('b1100000-0000-4000-8000-000000000001', 'd4b-owner@example.test'),
  ('b1100000-0000-4000-8000-000000000002', 'd4b-outsider@example.test');

insert into public.workspaces (id, name, created_by) values
  ('b1200000-0000-4000-8000-000000000001', 'D4b Agency', 'b1100000-0000-4000-8000-000000000001'),
  ('b1200000-0000-4000-8000-000000000002', 'D4b Other', 'b1100000-0000-4000-8000-000000000002');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('b1200000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001', 'owner'),
  ('b1200000-0000-4000-8000-000000000002', 'b1100000-0000-4000-8000-000000000002', 'owner');

insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  (
    'b1300000-0000-4000-8000-000000000001',
    'b1200000-0000-4000-8000-000000000001',
    'D4b Client',
    'd4b.example.com',
    'b1100000-0000-4000-8000-000000000001'
  );

insert into public.scans (
  id, workspace_id, project_id, idempotency_key, request_fingerprint, state,
  prompt_method_version, profile_method_version, query_count, created_by
) values (
  'b1400000-0000-4000-8000-000000000001',
  'b1200000-0000-4000-8000-000000000001',
  'b1300000-0000-4000-8000-000000000001',
  'b1410000-0000-4000-8000-000000000001',
  repeat('4', 64),
  'completed',
  'niche-prompts-v1',
  'company-profile-v2',
  1,
  'b1100000-0000-4000-8000-000000000001'
);

insert into public.scan_queries (
  workspace_id, scan_id, query_ordinal, query_id, query_version, query_text
) values (
  'b1200000-0000-4000-8000-000000000001',
  'b1400000-0000-4000-8000-000000000001',
  0,
  'niche-prompts-v1:d4b',
  'category@v1',
  'Which option should teams choose?'
);

insert into public.scan_attempts (
  id, workspace_id, scan_id, attempt_number, state, started_at, finished_at
) values (
  'b1500000-0000-4000-8000-000000000001',
  'b1200000-0000-4000-8000-000000000001',
  'b1400000-0000-4000-8000-000000000001',
  1,
  'completed',
  '2026-09-14T15:00:00Z',
  '2026-09-14T15:00:02Z'
);

insert into public.scan_attempt_queries (
  workspace_id, scan_id, attempt_id, query_ordinal, observation_id, state
) values (
  'b1200000-0000-4000-8000-000000000001',
  'b1400000-0000-4000-8000-000000000001',
  'b1500000-0000-4000-8000-000000000001',
  0,
  'b1600000-0000-4000-8000-000000000001',
  'answered'
);

insert into public.raw_observations (
  workspace_id, project_id, scan_id, attempt_id, query_ordinal,
  observation_id, query_id, query_version, query_text, provider, surface,
  capture_version, capture_mode, requested_model, model_version,
  provider_response_id, observed_at, raw_response, response_digest,
  raw_response_state, outcome, failure_code, answer_text, finish_reason,
  grounding_metadata, observation_fingerprint
) values (
  'b1200000-0000-4000-8000-000000000001',
  'b1300000-0000-4000-8000-000000000001',
  'b1400000-0000-4000-8000-000000000001',
  'b1500000-0000-4000-8000-000000000001',
  0,
  'b1600000-0000-4000-8000-000000000001',
  'niche-prompts-v1:d4b',
  'category@v1',
  'Which option should teams choose?',
  'gemini',
  'api',
  'gemini-generate-content-v1',
  'injected_transport',
  'gemini-d4b-test',
  'gemini-d4b-test-001',
  'd4b-response',
  '2026-09-14T15:00:01Z',
  '{"fixture":"d4b"}',
  'sha256:' || encode(
    extensions.digest(convert_to('{"fixture":"d4b"}', 'UTF8'), 'sha256'),
    'hex'
  ),
  'complete',
  'answered',
  null,
  'I recommend Acme. Acme is available.',
  'STOP',
  null,
  repeat('5', 64)
);

insert into public.entity_alias_catalogs (
  workspace_id, project_id, catalog_id, idempotency_key, method_version,
  request_fingerprint, entity_count, alias_count, created_by
) values
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1300000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000001',
    'b1710000-0000-4000-8000-000000000001',
    'entity-alias-v1', repeat('6', 64), 1, 1,
    'b1100000-0000-4000-8000-000000000001'
  ),
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1300000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000002',
    'b1710000-0000-4000-8000-000000000002',
    'entity-alias-v1', repeat('7', 64), 1, 1,
    'b1100000-0000-4000-8000-000000000001'
  );

insert into public.entity_alias_entities (
  workspace_id, project_id, catalog_id, entity_ordinal, entity_id,
  entity_kind, canonical_name
) values
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1300000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000001',
    0, 'b1800000-0000-4000-8000-000000000001', 'company', 'Acme'
  ),
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1300000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000002',
    0, 'b1800000-0000-4000-8000-000000000002', 'company', 'Acme'
  );

insert into public.entity_alias_entries (
  workspace_id, project_id, catalog_id, entity_ordinal, alias_ordinal,
  alias_id, method_version, alias_text, normalized_alias, match_state
) values
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1300000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000001',
    0, 0, 'b1900000-0000-4000-8000-000000000001',
    'entity-alias-v1', 'Acme', 'acme', 'eligible'
  ),
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1300000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000002',
    0, 0, 'b1900000-0000-4000-8000-000000000002',
    'entity-alias-v1', 'Acme', 'acme', 'eligible'
  );

insert into public.mention_detection_runs (
  workspace_id, project_id, observation_id, catalog_id, method_version,
  alias_method_version, request_fingerprint, answer_utf16_length,
  occurrence_count, mention_count, ambiguous_count
) values
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1300000-0000-4000-8000-000000000001',
    'b1600000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000001',
    'mention-detection-v1', 'entity-alias-v1', repeat('8', 64),
    36, 2, 2, 0
  ),
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1300000-0000-4000-8000-000000000001',
    'b1600000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000002',
    'mention-detection-v1', 'entity-alias-v1', repeat('9', 64),
    36, 0, 0, 0
  );

insert into public.mention_detection_occurrences (
  workspace_id, project_id, observation_id, catalog_id, method_version,
  occurrence_ordinal, state, start_utf16, end_utf16, source_text,
  normalized_alias, entity_id, entity_kind, alias_id, alias_text
) values
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1300000-0000-4000-8000-000000000001',
    'b1600000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000001',
    'mention-detection-v1', 0, 'mention', 12, 16, 'Acme', 'acme',
    'b1800000-0000-4000-8000-000000000001', 'company',
    'b1900000-0000-4000-8000-000000000001', 'Acme'
  ),
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1300000-0000-4000-8000-000000000001',
    'b1600000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000001',
    'mention-detection-v1', 1, 'mention', 18, 22, 'Acme', 'acme',
    'b1800000-0000-4000-8000-000000000001', 'company',
    'b1900000-0000-4000-8000-000000000001', 'Acme'
  );

select ok(has_table_privilege(
  'authenticated', 'public.recommendation_detection_runs', 'select'
), 'authenticated role has explicit recommendation run read access');
select ok(not has_table_privilege(
  'service_role', 'public.recommendation_detection_runs', 'insert'
), 'service role cannot directly insert recommendation runs');
select ok(not has_table_privilege(
  'service_role', 'public.recommendation_detection_results', 'select'
), 'service role cannot directly select recommendation results');
select ok(has_function_privilege(
  'service_role',
  'public.read_recommendation_detection_input(uuid,uuid,uuid)',
  'execute'
), 'service role can execute the narrow recommendation reader');
select ok(has_function_privilege(
  'service_role',
  'public.persist_recommendation_detection(uuid,uuid,uuid,jsonb)',
  'execute'
), 'service role can execute the narrow recommendation persistence RPC');
select ok(not has_function_privilege(
  'authenticated',
  'public.persist_recommendation_detection(uuid,uuid,uuid,jsonb)',
  'execute'
), 'authenticated clients cannot execute recommendation persistence');
select ok(not has_function_privilege(
  'anon',
  'public.read_recommendation_detection_input(uuid,uuid,uuid)',
  'execute'
), 'anonymous callers cannot execute recommendation reads');

set local role service_role;
select is(
  jsonb_array_length(
    public.read_recommendation_detection_input(
      'b1200000-0000-4000-8000-000000000001',
      'b1600000-0000-4000-8000-000000000001',
      'b1700000-0000-4000-8000-000000000001'
    ) -> 'mentions'
  ),
  2,
  'reader returns every persisted positive D3 mention in order'
);
select is(
  jsonb_array_length(
    public.read_recommendation_detection_input(
      'b1200000-0000-4000-8000-000000000001',
      'b1600000-0000-4000-8000-000000000001',
      'b1700000-0000-4000-8000-000000000002'
    ) -> 'mentions'
  ),
  0,
  'reader preserves an explicit zero-positive-mention D3 result'
);
select throws_ok(
  $$select public.read_recommendation_detection_input(
    'b1200000-0000-4000-8000-000000000002',
    'b1600000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000001'
  )$$,
  'P0001',
  'Recommendation detection input not found',
  'cross-workspace recommendation input fails closed'
);

select throws_ok(
  $$select public.persist_recommendation_detection(
    'b1200000-0000-4000-8000-000000000001',
    'b1600000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000001',
    '{"methodVersion":"recommendation-detection-v1","mentionMethodVersion":"mention-detection-v1","results":[{"occurrenceOrdinal":0,"state":"unknown","evidence":{"startUtf16":0,"endUtf16":16,"text":"I recommend Acme"}},{"occurrenceOrdinal":1,"state":"unknown","evidence":null}]}'::jsonb
  )$$,
  '22023',
  'Unknown recommendation state cannot contain evidence',
  'unknown classification cannot carry fabricated evidence'
);

select is(
  public.persist_recommendation_detection(
    'b1200000-0000-4000-8000-000000000001',
    'b1600000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000001',
    '{"methodVersion":"recommendation-detection-v1","mentionMethodVersion":"mention-detection-v1","results":[{"occurrenceOrdinal":0,"state":"recommended","evidence":{"startUtf16":0,"endUtf16":16,"text":"I recommend Acme"}},{"occurrenceOrdinal":1,"state":"unknown","evidence":null}]}'::jsonb
  ) ->> 'replayed',
  'false',
  'first valid recommendation persistence is not a replay'
);
select is((
  select state
  from public.recommendation_detection_results
  where occurrence_ordinal = 0
), 'recommended', 'positive recommendation state is linked to exact D3 occurrence');
select is((
  select evidence_text
  from public.recommendation_detection_results
  where occurrence_ordinal = 0
), 'I recommend Acme', 'positive recommendation keeps its exact evidence text');
select is((
  select state
  from public.recommendation_detection_results
  where occurrence_ordinal = 1
), 'unknown', 'neutral mention persists explicitly as unknown');
select is(
  public.persist_recommendation_detection(
    'b1200000-0000-4000-8000-000000000001',
    'b1600000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000001',
    '{"methodVersion":"recommendation-detection-v1","mentionMethodVersion":"mention-detection-v1","results":[{"occurrenceOrdinal":0,"state":"recommended","evidence":{"startUtf16":0,"endUtf16":16,"text":"I recommend Acme"}},{"occurrenceOrdinal":1,"state":"unknown","evidence":null}]}'::jsonb
  ) ->> 'replayed',
  'true',
  'identical recommendation persistence replays safely'
);
select throws_ok(
  $$select public.persist_recommendation_detection(
    'b1200000-0000-4000-8000-000000000001',
    'b1600000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000001',
    '{"methodVersion":"recommendation-detection-v1","mentionMethodVersion":"mention-detection-v1","results":[{"occurrenceOrdinal":0,"state":"not_recommended","evidence":{"startUtf16":0,"endUtf16":16,"text":"I recommend Acme"}},{"occurrenceOrdinal":1,"state":"unknown","evidence":null}]}'::jsonb
  )$$,
  '22023',
  'Recommendation detection replay conflicts with stored evidence',
  'conflicting recommendation replay fails closed'
);
select is(
  public.persist_recommendation_detection(
    'b1200000-0000-4000-8000-000000000001',
    'b1600000-0000-4000-8000-000000000001',
    'b1700000-0000-4000-8000-000000000002',
    '{"methodVersion":"recommendation-detection-v1","mentionMethodVersion":"mention-detection-v1","results":[]}'::jsonb
  ) ->> 'resultCount',
  '0',
  'zero-positive-mention classification persists an explicit zero-result run'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1100000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.recommendation_detection_runs), 2::bigint,
  'workspace owner can read both recommendation runs through RLS');
select is((select count(*) from public.recommendation_detection_results), 2::bigint,
  'workspace owner can read recommendation results through RLS');

select set_config('request.jwt.claim.sub', 'b1100000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.recommendation_detection_runs), 0::bigint,
  'outsider cannot read recommendation runs from another workspace');
select is((select count(*) from public.recommendation_detection_results), 0::bigint,
  'outsider cannot read recommendation results from another workspace');

reset role;
select throws_ok(
  $$update public.recommendation_detection_results
    set state = 'unknown'
    where occurrence_ordinal = 0$$,
  '22023',
  'Recommendation detection evidence is immutable',
  'persisted recommendation evidence cannot be rewritten'
);

select * from finish();
rollback;
