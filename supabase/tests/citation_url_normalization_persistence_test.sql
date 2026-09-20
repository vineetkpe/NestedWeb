-- Versioned citation URL normalization persistence fixtures. Run only on disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'normalization-owner@example.test'),
  ('e1000000-0000-4000-8000-000000000002', 'normalization-outsider@example.test');

insert into public.workspaces (id, name, created_by) values
  ('e2000000-0000-4000-8000-000000000001', 'Normalization Agency', 'e1000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000002', 'Other Normalization Agency', 'e1000000-0000-4000-8000-000000000002');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'owner'),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'owner');

insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values (
  'e3000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'Normalization Client',
  'normalization.example.com',
  'e1000000-0000-4000-8000-000000000001'
);

insert into public.scans (
  id, workspace_id, project_id, idempotency_key, request_fingerprint, state,
  prompt_method_version, profile_method_version, query_count, created_by
) values (
  'e4000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e4100000-0000-4000-8000-000000000001',
  repeat('a', 64),
  'completed',
  'niche-prompts-v1',
  'company-profile-v2',
  1,
  'e1000000-0000-4000-8000-000000000001'
);

insert into public.scan_queries (
  workspace_id, scan_id, query_ordinal, query_id, query_version, query_text
) values (
  'e2000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  0,
  'niche-prompts-v1:normalization-test',
  'category@v1',
  'Which tools are available for "AI visibility"?'
);

insert into public.scan_attempts (
  id, workspace_id, scan_id, attempt_number, state, started_at, finished_at
) values (
  'e5000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  1,
  'completed',
  '2026-09-14T05:40:00.000Z',
  '2026-09-14T05:40:02.000Z'
);

insert into public.scan_attempt_queries (
  workspace_id, scan_id, attempt_id, query_ordinal, observation_id, state
) values (
  'e2000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  0,
  'e6000000-0000-4000-8000-000000000001',
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
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  0,
  'e6000000-0000-4000-8000-000000000001',
  'niche-prompts-v1:normalization-test',
  'category@v1',
  'Which tools are available for "AI visibility"?',
  'gemini',
  'api',
  'gemini-generate-content-v1',
  'injected_transport',
  'gemini-normalization-test',
  'gemini-normalization-test-001',
  'normalization-fixture-response',
  '2026-09-14T05:40:01.000Z',
  '{"fixture":true}',
  'sha256:' || encode(
    extensions.digest(convert_to('{"fixture":true}', 'UTF8'), 'sha256'),
    'hex'
  ),
  'complete',
  'answered',
  null,
  'Fixture answer with source evidence.',
  'STOP',
  null,
  repeat('b', 64)
);

insert into public.raw_citations (
  workspace_id, observation_id, citation_ordinal, citation_id, cited_url,
  source_title, captured_at, relationship, verification,
  grounding_chunk_index, url_status, source_domain, exclusion_reason
) values
  (
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    0,
    'e6000000-0000-4000-8000-000000000001:grounding:0',
    'HTTPS://BÜCHER.Example:443/a?utm_source=x&b=2&a=1#section',
    'First',
    '2026-09-14T05:40:01.000Z',
    'source_list_only',
    'not_checked',
    0,
    'eligible',
    'xn--bcher-kva.example',
    null
  ),
  (
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    1,
    'e6000000-0000-4000-8000-000000000001:grounding:2',
    'HTTPS://BÜCHER.Example:443/a?utm_source=x&b=2&a=1#section',
    'Second',
    '2026-09-14T05:40:01.000Z',
    'source_list_only',
    'not_checked',
    2,
    'eligible',
    'xn--bcher-kva.example',
    null
  ),
  (
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    2,
    'e6000000-0000-4000-8000-000000000001:grounding:3',
    'javascript:alert(1)',
    'Unsafe',
    '2026-09-14T05:40:01.000Z',
    'source_list_only',
    'not_checked',
    3,
    'excluded',
    null,
    'unsafe_url'
  );

select ok(has_table_privilege('authenticated', 'public.citation_url_normalizations', 'select'),
  'authenticated role has explicit read access to citation normalizations');
select ok(not has_table_privilege('anon', 'public.citation_url_normalizations', 'select'),
  'anonymous role cannot read citation normalizations');
select ok(not has_table_privilege('authenticated', 'public.citation_url_normalizations', 'insert'),
  'authenticated callers cannot directly insert citation normalizations');
select ok(not has_table_privilege('service_role', 'public.citation_url_normalizations', 'insert'),
  'service role cannot bypass the normalization RPC with direct inserts');
select ok(not has_table_privilege('service_role', 'public.citation_url_normalizations', 'update'),
  'service role cannot directly update citation normalizations');
select ok(not has_table_privilege('service_role', 'public.citation_url_normalizations', 'delete'),
  'service role cannot directly delete citation normalizations');
select ok(has_function_privilege(
  'service_role',
  'public.persist_citation_url_normalization(uuid,uuid,text,jsonb)',
  'execute'
), 'service role can persist normalization through the narrow RPC');
select ok(not has_function_privilege(
  'authenticated',
  'public.persist_citation_url_normalization(uuid,uuid,text,jsonb)',
  'execute'
), 'authenticated callers cannot invoke the normalization persistence RPC');

set local role service_role;
select is(
  public.persist_citation_url_normalization(
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001:grounding:0',
    jsonb_build_object(
      'methodVersion', 'citation-url-v1',
      'state', 'normalized',
      'canonicalUrl', 'https://xn--bcher-kva.example/a?utm_source=x&b=2&a=1#section',
      'canonicalDomain', 'xn--bcher-kva.example',
      'exclusionReason', null
    )
  ) ->> 'replayed',
  'false',
  'first normalized citation persistence is not a replay'
);

select is(
  public.persist_citation_url_normalization(
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001:grounding:2',
    jsonb_build_object(
      'methodVersion', 'citation-url-v1',
      'state', 'normalized',
      'canonicalUrl', 'https://xn--bcher-kva.example/a?utm_source=x&b=2&a=1#section',
      'canonicalDomain', 'xn--bcher-kva.example',
      'exclusionReason', null
    )
  ) ->> 'replayed',
  'false',
  'duplicate source URL persists as its own citation occurrence'
);

select is(
  public.persist_citation_url_normalization(
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001:grounding:3',
    jsonb_build_object(
      'methodVersion', 'citation-url-v1',
      'state', 'excluded',
      'canonicalUrl', null,
      'canonicalDomain', null,
      'exclusionReason', 'unsupported_scheme'
    )
  ) ->> 'state',
  'excluded',
  'unsafe raw source remains an explicit derived exclusion'
);

select is(
  public.persist_citation_url_normalization(
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001:grounding:0',
    jsonb_build_object(
      'methodVersion', 'citation-url-v1',
      'state', 'normalized',
      'canonicalUrl', 'https://xn--bcher-kva.example/a?utm_source=x&b=2&a=1#section',
      'canonicalDomain', 'xn--bcher-kva.example',
      'exclusionReason', null
    )
  ) ->> 'replayed',
  'true',
  'identical normalization replay is idempotent'
);

select throws_ok(
  $$select public.persist_citation_url_normalization(
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001:grounding:0',
    '{"methodVersion":"citation-url-v1","state":"normalized","canonicalUrl":"https://example.com/changed","canonicalDomain":"example.com","exclusionReason":null}'::jsonb
  )$$,
  '22023',
  'Citation normalization replay conflicts with stored evidence',
  'same citation and method version cannot be replayed with changed derived evidence'
);

select throws_ok(
  $$select public.persist_citation_url_normalization(
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001:grounding:99',
    '{"methodVersion":"citation-url-v1","state":"excluded","canonicalUrl":null,"canonicalDomain":null,"exclusionReason":"invalid_url"}'::jsonb
  )$$,
  'P0001',
  'Raw citation not found',
  'normalization cannot be detached from an exact stored raw citation'
);

select throws_ok(
  $$select public.persist_citation_url_normalization(
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001:grounding:0',
    '{"methodVersion":"citation-url-v2","state":"normalized","canonicalUrl":"https://example.com/","canonicalDomain":"example.com","exclusionReason":null}'::jsonb
  )$$,
  '22023',
  'Invalid citation normalization payload',
  'unimplemented normalization method versions fail closed'
);

select throws_ok(
  $$insert into public.citation_url_normalizations (
    workspace_id, observation_id, citation_id, method_version,
    normalization_state, canonical_url, canonical_domain, exclusion_reason
  ) values (
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001:grounding:0',
    'citation-url-v1', 'normalized', 'https://example.com/', 'example.com', null
  )$$,
  '42501',
  null,
  'service role cannot directly insert derived citation evidence'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.citation_url_normalizations), 3::bigint,
  'workspace member can read all three derived citation occurrences');
select is((select count(*) from public.citation_url_normalizations
  where canonical_url = 'https://xn--bcher-kva.example/a?utm_source=x&b=2&a=1#section'),
  2::bigint, 'duplicate raw URLs remain separate normalized occurrences');
select is((select count(*) from public.citation_url_normalizations
  where normalization_state = 'excluded'
    and canonical_url is null
    and canonical_domain is null
    and exclusion_reason = 'unsupported_scheme'),
  1::bigint, 'excluded normalization remains explicit and carries its reason');
select is((select count(*) from public.citation_url_normalizations
  where method_version = 'citation-url-v1'),
  3::bigint, 'every derived occurrence records the exact normalization method version');
select is((
  select count(*)
  from public.citation_url_normalizations normalization
  join public.raw_citations citation
    on citation.workspace_id = normalization.workspace_id
   and citation.observation_id = normalization.observation_id
   and citation.citation_id = normalization.citation_id
  join public.raw_observations observation
    on observation.workspace_id = citation.workspace_id
   and observation.observation_id = citation.observation_id
  where observation.provider = 'gemini'
), 3::bigint, 'derived rows retain exact raw citation and provider provenance through their foreign key');
select is((select count(*) from public.raw_citations), 3::bigint,
  'normalization does not rewrite or remove raw citation occurrences');
select is((select count(*) from public.raw_citations
  where cited_url = 'javascript:alert(1)'
    and url_status = 'excluded'
    and exclusion_reason = 'unsafe_url'),
  1::bigint, 'raw capture-time exclusion remains unchanged beside derived normalization');
select throws_ok(
  $$insert into public.citation_url_normalizations (
    workspace_id, observation_id, citation_id, method_version,
    normalization_state, canonical_url, canonical_domain, exclusion_reason
  ) values (
    'e2000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001:grounding:0',
    'citation-url-v1', 'normalized', 'https://example.com/', 'example.com', null
  )$$,
  '42501',
  null,
  'browser role cannot directly insert derived citation evidence'
);

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.citation_url_normalizations), 0::bigint,
  'nonmember cannot read another workspace citation normalizations');

reset role;
select * from finish();
rollback;