-- D1c bounded raw-citation read fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('d1000000-0000-4000-8000-000000000001', 'd1c-owner@example.test'),
  ('d1000000-0000-4000-8000-000000000002', 'd1c-other@example.test');

insert into public.workspaces (id, name, created_by) values
  ('d2000000-0000-4000-8000-000000000001', 'D1c Agency', 'd1000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000002', 'D1c Other Agency', 'd1000000-0000-4000-8000-000000000002');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'owner'),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'owner');

insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  (
    'd3000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'D1c Client',
    'd1c.example.com',
    'd1000000-0000-4000-8000-000000000001'
  ),
  (
    'd3000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002',
    'D1c Other Client',
    'other-d1c.example.com',
    'd1000000-0000-4000-8000-000000000002'
  );

insert into public.scans (
  id, workspace_id, project_id, idempotency_key, request_fingerprint, state,
  prompt_method_version, profile_method_version, query_count, created_by
) values
  (
    'd4000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',
    'd4100000-0000-4000-8000-000000000001',
    repeat('c', 64),
    'completed',
    'niche-prompts-v1',
    'company-profile-v2',
    1,
    'd1000000-0000-4000-8000-000000000001'
  ),
  (
    'd4000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002',
    'd3000000-0000-4000-8000-000000000002',
    'd4100000-0000-4000-8000-000000000002',
    repeat('d', 64),
    'completed',
    'niche-prompts-v1',
    'company-profile-v2',
    1,
    'd1000000-0000-4000-8000-000000000002'
  );

insert into public.scan_queries (
  workspace_id, scan_id, query_ordinal, query_id, query_version, query_text
) values
  (
    'd2000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    0,
    'niche-prompts-v1:d1c-main',
    'category@v1',
    'Which tools are available for D1c?'
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'd4000000-0000-4000-8000-000000000002',
    0,
    'niche-prompts-v1:d1c-other',
    'category@v1',
    'Which tools are available for other D1c?'
  );

insert into public.scan_attempts (
  id, workspace_id, scan_id, attempt_number, state, started_at, finished_at
) values
  (
    'd5000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    1,
    'completed',
    '2026-09-14T06:10:00.000Z',
    '2026-09-14T06:10:02.000Z'
  ),
  (
    'd5000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002',
    'd4000000-0000-4000-8000-000000000002',
    1,
    'completed',
    '2026-09-14T06:10:00.000Z',
    '2026-09-14T06:10:02.000Z'
  );

insert into public.scan_attempt_queries (
  workspace_id, scan_id, attempt_id, query_ordinal, observation_id, state
) values
  (
    'd2000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001',
    0,
    'd6000000-0000-4000-8000-000000000001',
    'answered'
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'd4000000-0000-4000-8000-000000000002',
    'd5000000-0000-4000-8000-000000000002',
    0,
    'd6000000-0000-4000-8000-000000000002',
    'answered'
  );

insert into public.raw_observations (
  workspace_id, project_id, scan_id, attempt_id, query_ordinal,
  observation_id, query_id, query_version, query_text, provider, surface,
  capture_version, capture_mode, requested_model, model_version,
  provider_response_id, observed_at, raw_response, response_digest,
  raw_response_state, outcome, failure_code, answer_text, finish_reason,
  grounding_metadata, observation_fingerprint
) values
  (
    'd2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001',
    0,
    'd6000000-0000-4000-8000-000000000001',
    'niche-prompts-v1:d1c-main',
    'category@v1',
    'Which tools are available for D1c?',
    'gemini',
    'api',
    'gemini-generate-content-v1',
    'injected_transport',
    'gemini-d1c-test',
    'gemini-d1c-test-001',
    'd1c-main-response',
    '2026-09-14T06:10:01.000Z',
    '{"fixture":"main"}',
    'sha256:' || encode(
      extensions.digest(convert_to('{"fixture":"main"}', 'UTF8'), 'sha256'),
      'hex'
    ),
    'complete',
    'answered',
    null,
    'Fixture answer.',
    'STOP',
    null,
    repeat('e', 64)
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'd3000000-0000-4000-8000-000000000002',
    'd4000000-0000-4000-8000-000000000002',
    'd5000000-0000-4000-8000-000000000002',
    0,
    'd6000000-0000-4000-8000-000000000002',
    'niche-prompts-v1:d1c-other',
    'category@v1',
    'Which tools are available for other D1c?',
    'gemini',
    'api',
    'gemini-generate-content-v1',
    'injected_transport',
    'gemini-d1c-test',
    'gemini-d1c-test-002',
    'd1c-other-response',
    '2026-09-14T06:10:01.000Z',
    '{"fixture":"other"}',
    'sha256:' || encode(
      extensions.digest(convert_to('{"fixture":"other"}', 'UTF8'), 'sha256'),
      'hex'
    ),
    'complete',
    'answered',
    null,
    'Other fixture answer.',
    'STOP',
    null,
    repeat('f', 64)
  );

insert into public.raw_citations (
  workspace_id, observation_id, citation_ordinal, citation_id, cited_url,
  source_title, captured_at, relationship, verification,
  grounding_chunk_index, url_status, source_domain, exclusion_reason
)
select
  'd2000000-0000-4000-8000-000000000001'::uuid,
  'd6000000-0000-4000-8000-000000000001'::uuid,
  citation_ordinal::smallint,
  'd1c-main-citation-' || citation_ordinal,
  'https://example.com/source/' || citation_ordinal,
  'Source ' || citation_ordinal,
  '2026-09-14T06:10:01.000Z'::timestamptz,
  'source_list_only',
  'not_checked',
  citation_ordinal::smallint,
  'eligible',
  'example.com',
  null
from generate_series(0, 49) citation_ordinal;

insert into public.raw_citations (
  workspace_id, observation_id, citation_ordinal, citation_id, cited_url,
  source_title, captured_at, relationship, verification,
  grounding_chunk_index, url_status, source_domain, exclusion_reason
) values (
  'd2000000-0000-4000-8000-000000000002',
  'd6000000-0000-4000-8000-000000000002',
  0,
  'd1c-other-citation-0',
  'https://other.example.com/source',
  'Other source',
  '2026-09-14T06:10:01.000Z',
  'source_list_only',
  'not_checked',
  0,
  'eligible',
  'other.example.com',
  null
);

select ok(not has_table_privilege('service_role', 'public.raw_citations', 'select'),
  'service role still cannot directly select raw citations');
select ok(has_function_privilege(
  'service_role',
  'public.list_raw_citations_for_normalization(uuid,uuid)',
  'execute'
), 'service role can use the narrow raw-citation normalization reader');
select ok(not has_function_privilege(
  'authenticated',
  'public.list_raw_citations_for_normalization(uuid,uuid)',
  'execute'
), 'authenticated callers cannot invoke the normalization reader');
select ok(not has_function_privilege(
  'anon',
  'public.list_raw_citations_for_normalization(uuid,uuid)',
  'execute'
), 'anonymous callers cannot invoke the normalization reader');

set local role service_role;
select is(
  jsonb_array_length(
    public.list_raw_citations_for_normalization(
      'd2000000-0000-4000-8000-000000000001',
      'd6000000-0000-4000-8000-000000000001'
    ) -> 'citations'
  ),
  50,
  'reader returns at most the provider citation bound of 50 occurrences'
);
select is(
  public.list_raw_citations_for_normalization(
    'd2000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001'
  ) -> 'citations' -> 0 ->> 'citationId',
  'd1c-main-citation-0',
  'reader preserves the first persisted citation occurrence'
);
select is(
  public.list_raw_citations_for_normalization(
    'd2000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001'
  ) -> 'citations' -> 49 ->> 'citationId',
  'd1c-main-citation-49',
  'reader preserves citation ordinal ordering through the final occurrence'
);
select is(
  public.list_raw_citations_for_normalization(
    'd2000000-0000-4000-8000-000000000002',
    'd6000000-0000-4000-8000-000000000002'
  ) -> 'citations' -> 0 ->> 'citationId',
  'd1c-other-citation-0',
  'reader scopes results to the exact workspace and observation'
);
select throws_ok(
  $$select public.list_raw_citations_for_normalization(
    'd2000000-0000-4000-8000-000000000002',
    'd6000000-0000-4000-8000-000000000001'
  )$$,
  'P0001',
  'Raw observation not found',
  'cross-workspace observation identity fails closed'
);
select throws_ok(
  $$select * from public.raw_citations limit 1$$,
  '42501',
  null,
  'service role cannot bypass the reader with direct raw-citation SELECT'
);

reset role;
select * from finish();
rollback;
