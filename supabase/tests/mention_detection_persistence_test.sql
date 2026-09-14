-- D3b mention detection persistence fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'mention-owner@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'mention-member@example.test'),
  ('a1000000-0000-4000-8000-000000000003', 'mention-outsider@example.test');

insert into public.workspaces (id, name, created_by) values
  ('a2000000-0000-4000-8000-000000000001', 'Mention Agency', 'a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002', 'Mention Outsider Agency', 'a1000000-0000-4000-8000-000000000003');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'member'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003', 'owner');

insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  (
    'a3000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'Mention Client',
    'mention.example.com',
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000001',
    'Mention Other Project',
    'mention-other.example.com',
    'a1000000-0000-4000-8000-000000000001'
  );

insert into public.scans (
  id, workspace_id, project_id, idempotency_key, request_fingerprint, state,
  prompt_method_version, profile_method_version, query_count, created_by
) values (
  'a4000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a4100000-0000-4000-8000-000000000001',
  repeat('a', 64),
  'completed',
  'niche-prompts-v1',
  'company-profile-v2',
  1,
  'a1000000-0000-4000-8000-000000000001'
);

insert into public.scan_queries (
  workspace_id, scan_id, query_ordinal, query_id, query_version, query_text
) values (
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  0,
  'niche-prompts-v1:mention-main',
  'category@v1',
  'Which brands are mentioned?'
);

insert into public.scan_attempts (
  id, workspace_id, scan_id, attempt_number, state, started_at, finished_at
) values (
  'a5000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  1,
  'completed',
  '2026-09-14T07:50:00.000Z',
  '2026-09-14T07:50:02.000Z'
);

insert into public.scan_attempt_queries (
  workspace_id, scan_id, attempt_id, query_ordinal, observation_id, state
) values (
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  0,
  'a6000000-0000-4000-8000-000000000001',
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
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  0,
  'a6000000-0000-4000-8000-000000000001',
  'niche-prompts-v1:mention-main',
  'category@v1',
  'Which brands are mentioned?',
  'gemini',
  'api',
  'gemini-generate-content-v1',
  'injected_transport',
  'gemini-mention-test',
  'gemini-mention-test-001',
  'mention-main-response',
  '2026-09-14T07:50:01.000Z',
  '{"fixture":"mention"}',
  'sha256:' || encode(
    extensions.digest(convert_to('{"fixture":"mention"}', 'UTF8'), 'sha256'),
    'hex'
  ),
  'complete',
  'answered',
  null,
  'ACME and Shared.',
  'STOP',
  null,
  repeat('b', 64)
);

insert into public.entity_alias_catalogs (
  workspace_id, project_id, catalog_id, idempotency_key, method_version,
  request_fingerprint, entity_count, alias_count, created_by
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'entity-alias-v1',
    repeat('c', 64),
    3,
    3,
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000002',
    'a7000000-0000-4000-8000-000000000002',
    'a7100000-0000-4000-8000-000000000002',
    'entity-alias-v1',
    repeat('d', 64),
    1,
    1,
    'a1000000-0000-4000-8000-000000000001'
  );

insert into public.entity_alias_entities (
  workspace_id, project_id, catalog_id, entity_ordinal, entity_id,
  entity_kind, canonical_name
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    0,
    'a8000000-0000-4000-8000-000000000001',
    'company',
    'Acme Corporation'
  ),
  (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    1,
    'a8000000-0000-4000-8000-000000000002',
    'product',
    'Shared One'
  ),
  (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    2,
    'a8000000-0000-4000-8000-000000000003',
    'product',
    'Shared Two'
  ),
  (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000002',
    'a7000000-0000-4000-8000-000000000002',
    0,
    'a8000000-0000-4000-8000-000000000004',
    'company',
    'Other Company'
  );

insert into public.entity_alias_entries (
  workspace_id, project_id, catalog_id, entity_ordinal, alias_ordinal,
  alias_id, method_version, alias_text, normalized_alias, match_state
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    0,
    0,
    'a9000000-0000-4000-8000-000000000001',
    'entity-alias-v1',
    'Acme',
    'acme',
    'eligible'
  ),
  (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    1,
    0,
    'a9000000-0000-4000-8000-000000000002',
    'entity-alias-v1',
    'Shared',
    'shared',
    'ambiguous'
  ),
  (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    2,
    0,
    'a9000000-0000-4000-8000-000000000003',
    'entity-alias-v1',
    'shared',
    'shared',
    'ambiguous'
  ),
  (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000002',
    'a7000000-0000-4000-8000-000000000002',
    0,
    0,
    'a9000000-0000-4000-8000-000000000004',
    'entity-alias-v1',
    'Other',
    'other',
    'eligible'
  );

select ok(has_table_privilege('authenticated', 'public.mention_detection_runs', 'select'),
  'authenticated members have explicit read access to mention runs');
select ok(not has_table_privilege('authenticated', 'public.mention_detection_runs', 'insert'),
  'authenticated clients cannot directly insert mention runs');
select ok(not has_table_privilege('service_role', 'public.mention_detection_runs', 'insert'),
  'service role cannot directly insert mention runs');
select ok(not has_table_privilege('service_role', 'public.mention_detection_occurrences', 'update'),
  'service role cannot directly mutate mention occurrences');
select ok(has_function_privilege(
  'service_role',
  'public.read_mention_detection_input(uuid,uuid,uuid)',
  'execute'
), 'service role can use the exact mention input reader');
select ok(has_function_privilege(
  'service_role',
  'public.persist_mention_detection(uuid,uuid,uuid,jsonb)',
  'execute'
), 'service role can use the narrow mention persistence RPC');
select ok(not has_function_privilege(
  'authenticated',
  'public.read_mention_detection_input(uuid,uuid,uuid)',
  'execute'
), 'authenticated clients cannot invoke the service mention reader');
select ok(not has_function_privilege(
  'authenticated',
  'public.persist_mention_detection(uuid,uuid,uuid,jsonb)',
  'execute'
), 'authenticated clients cannot invoke service mention persistence');
select ok(not has_function_privilege(
  'anon',
  'public.persist_mention_detection(uuid,uuid,uuid,jsonb)',
  'execute'
), 'anonymous callers cannot persist mention evidence');

set local role service_role;
select is(
  public.read_mention_detection_input(
    'a2000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001'
  ) ->> 'answerText',
  'ACME and Shared.',
  'service reader returns the exact persisted answer text'
);
select is(
  public.read_mention_detection_input(
    'a2000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001'
  ) -> 'catalog' -> 'entities' -> 1 -> 'aliases' -> 0 ->> 'matchState',
  'ambiguous',
  'service reader preserves the explicit D2 ambiguity state'
);
select throws_ok(
  $$select public.read_mention_detection_input(
    'a2000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000002'
  )$$,
  'P0001',
  'Mention detection input not found',
  'observation and alias catalog from different projects fail closed'
);

select is(
  public.persist_mention_detection(
    'a2000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'methodVersion', 'mention-detection-v1',
      'aliasMethodVersion', 'entity-alias-v1',
      'catalogId', 'a7000000-0000-4000-8000-000000000001',
      'answerUtf16Length', 16,
      'occurrences', jsonb_build_array(
        jsonb_build_object(
          'occurrenceOrdinal', 0,
          'state', 'mention',
          'entityId', 'a8000000-0000-4000-8000-000000000001',
          'entityKind', 'company',
          'aliasId', 'a9000000-0000-4000-8000-000000000001',
          'aliasText', 'Acme',
          'normalizedAlias', 'acme',
          'source', jsonb_build_object(
            'startUtf16', 0,
            'endUtf16', 4,
            'text', 'ACME'
          )
        ),
        jsonb_build_object(
          'occurrenceOrdinal', 1,
          'state', 'ambiguous',
          'normalizedAlias', 'shared',
          'candidates', jsonb_build_array(
            jsonb_build_object(
              'entityId', 'a8000000-0000-4000-8000-000000000002',
              'entityKind', 'product',
              'aliasId', 'a9000000-0000-4000-8000-000000000002',
              'aliasText', 'Shared'
            ),
            jsonb_build_object(
              'entityId', 'a8000000-0000-4000-8000-000000000003',
              'entityKind', 'product',
              'aliasId', 'a9000000-0000-4000-8000-000000000003',
              'aliasText', 'shared'
            )
          ),
          'source', jsonb_build_object(
            'startUtf16', 9,
            'endUtf16', 15,
            'text', 'Shared'
          )
        )
      )
    )
  ) ->> 'replayed',
  'false',
  'first exact mention result persistence is not a replay'
);

select is((select count(*) from public.mention_detection_runs), 1::bigint,
  'one immutable detection run is persisted');
select is((select count(*) from public.mention_detection_occurrences), 2::bigint,
  'positive and ambiguous occurrences are persisted separately');
select is((
  select count(*)
  from public.mention_detection_occurrences occurrence
  join public.raw_observations observation
    on observation.workspace_id = occurrence.workspace_id
   and observation.observation_id = occurrence.observation_id
  where occurrence.state = 'mention'
    and occurrence.entity_id = 'a8000000-0000-4000-8000-000000000001'
    and occurrence.alias_id = 'a9000000-0000-4000-8000-000000000001'
    and occurrence.start_utf16 = 0
    and occurrence.end_utf16 = 4
    and occurrence.source_text = 'ACME'
    and observation.answer_text = 'ACME and Shared.'
), 1::bigint, 'positive mention keeps exact observation, alias IDs, and evidence span');
select is((select count(*) from public.mention_detection_ambiguous_candidates), 2::bigint,
  'ambiguous occurrence stores the complete two-candidate collision set');
select is((
  select string_agg(alias_text, ',' order by candidate_ordinal)
  from public.mention_detection_ambiguous_candidates
), 'Shared,shared', 'ambiguous candidates preserve catalog order and exact alias text');

select is(
  public.persist_mention_detection(
    'a2000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'methodVersion', 'mention-detection-v1',
      'aliasMethodVersion', 'entity-alias-v1',
      'catalogId', 'a7000000-0000-4000-8000-000000000001',
      'answerUtf16Length', 16,
      'occurrences', jsonb_build_array(
        jsonb_build_object(
          'occurrenceOrdinal', 0,
          'state', 'mention',
          'entityId', 'a8000000-0000-4000-8000-000000000001',
          'entityKind', 'company',
          'aliasId', 'a9000000-0000-4000-8000-000000000001',
          'aliasText', 'Acme',
          'normalizedAlias', 'acme',
          'source', jsonb_build_object('startUtf16', 0, 'endUtf16', 4, 'text', 'ACME')
        ),
        jsonb_build_object(
          'occurrenceOrdinal', 1,
          'state', 'ambiguous',
          'normalizedAlias', 'shared',
          'candidates', jsonb_build_array(
            jsonb_build_object(
              'entityId', 'a8000000-0000-4000-8000-000000000002',
              'entityKind', 'product',
              'aliasId', 'a9000000-0000-4000-8000-000000000002',
              'aliasText', 'Shared'
            ),
            jsonb_build_object(
              'entityId', 'a8000000-0000-4000-8000-000000000003',
              'entityKind', 'product',
              'aliasId', 'a9000000-0000-4000-8000-000000000003',
              'aliasText', 'shared'
            )
          ),
          'source', jsonb_build_object('startUtf16', 9, 'endUtf16', 15, 'text', 'Shared')
        )
      )
    )
  ) ->> 'replayed',
  'true',
  'identical mention result replay is idempotent'
);

select throws_ok(
  $$select public.persist_mention_detection(
    'a2000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    '{"methodVersion":"mention-detection-v1","aliasMethodVersion":"entity-alias-v1","catalogId":"a7000000-0000-4000-8000-000000000001","answerUtf16Length":16,"occurrences":[]}'::jsonb
  )$$,
  '22023',
  'Mention detection replay conflicts with stored evidence',
  'changed replay for the same observation/catalog/method fails closed'
);
select throws_ok(
  $$select public.persist_mention_detection(
    'a2000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000002',
    '{"methodVersion":"mention-detection-v1","aliasMethodVersion":"entity-alias-v1","catalogId":"a7000000-0000-4000-8000-000000000002","answerUtf16Length":16,"occurrences":[]}'::jsonb
  )$$,
  'P0001',
  'Mention detection input not found',
  'persistence also rejects cross-project observation/catalog composition'
);
select throws_ok(
  $$insert into public.mention_detection_runs (
    workspace_id, project_id, observation_id, catalog_id, method_version,
    alias_method_version, request_fingerprint, answer_utf16_length,
    occurrence_count, mention_count, ambiguous_count
  ) values (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    'mention-detection-v1',
    'entity-alias-v1',
    repeat('e', 64),
    16,
    0,
    0,
    0
  )$$,
  '42501',
  null,
  'service role cannot bypass persistence RPC with direct table insert'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.mention_detection_runs), 1::bigint,
  'workspace member can read persisted mention runs through RLS');
select is((select count(*) from public.mention_detection_occurrences), 2::bigint,
  'workspace member can read occurrence evidence through RLS');
select is((select count(*) from public.mention_detection_ambiguous_candidates), 2::bigint,
  'workspace member can read ambiguous candidate evidence through RLS');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.mention_detection_runs), 0::bigint,
  'outsider cannot read mention runs from another workspace');
select is((select count(*) from public.mention_detection_occurrences), 0::bigint,
  'outsider cannot read occurrence evidence from another workspace');

reset role;
select throws_ok(
  $$update public.mention_detection_occurrences
    set source_text = 'forged'
    where occurrence_ordinal = 0$$,
  '22023',
  'Mention detection evidence is immutable',
  'stored mention evidence cannot be rewritten'
);

select * from finish();
rollback;
