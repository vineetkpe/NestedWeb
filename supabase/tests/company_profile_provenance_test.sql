-- Test-only fixtures. Run on disposable local Supabase, never customer data.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'profile-owner-a@example.test'),
  ('b1000000-0000-4000-8000-000000000002', 'profile-owner-b@example.test'),
  ('b1000000-0000-4000-8000-000000000003', 'profile-outsider@example.test');

insert into public.workspaces (id, name, created_by) values
  ('b2000000-0000-4000-8000-000000000001', 'Profile Agency A', 'b1000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000002', 'Profile Agency B', 'b1000000-0000-4000-8000-000000000002');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'owner'),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'owner');

insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Profile Client A', 'profile-a.example.test', 'b1000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'Profile Client B', 'profile-b.example.test', 'b1000000-0000-4000-8000-000000000002');

create temporary table profile_provenance_fixture (
  crawl_result jsonb not null,
  profile jsonb not null
) on commit drop;

insert into profile_provenance_fixture (crawl_result, profile) values (
  jsonb_build_object(
    'ok', true,
    'pages', jsonb_build_array(jsonb_build_object(
      'url', 'https://profile-a.example.test/',
      'sourceUrl', 'https://profile-a.example.test',
      'title', 'Profile Client A',
      'description', 'Profile fixture',
      'language', 'en',
      'statusCode', 200,
      'markdown', E'# About us\nCompany name: Profile Client A'
    ))
  ),
  jsonb_build_object(
    'methodVersion', 'company-profile-v2',
    'fields', jsonb_build_object(
      'companyName', jsonb_build_object(
        'status', 'confirmed',
        'values', jsonb_build_array(jsonb_build_object(
          'value', 'Profile Client A',
          'evidence', jsonb_build_array(jsonb_build_object(
            'pageIndex', 0,
            'pageUrl', 'https://profile-a.example.test/',
            'contentField', 'markdown',
            'start', 11,
            'end', 41,
            'quote', 'Company name: Profile Client A'
          ))
        ))
      ),
      'productName', jsonb_build_object('status', 'unknown', 'reason', 'no_supported_statement'),
      'shortDescription', jsonb_build_object('status', 'unknown', 'reason', 'no_supported_statement'),
      'primaryProduct', jsonb_build_object('status', 'unknown', 'reason', 'no_supported_statement'),
      'targetAudience', jsonb_build_object('status', 'unknown', 'reason', 'no_supported_statement'),
      'industry', jsonb_build_object('status', 'unknown', 'reason', 'no_supported_statement'),
      'keyUseCases', jsonb_build_object('status', 'unknown', 'reason', 'no_supported_statement'),
      'capabilities', jsonb_build_object('status', 'unknown', 'reason', 'no_supported_statement'),
      'geography', jsonb_build_object('status', 'unknown', 'reason', 'no_supported_statement')
    ),
    'excludedPages', '[]'::jsonb
  )
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.company_profile_snapshots'::regclass),
  'company profile snapshots enable RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.company_profile_snapshots', 'insert'),
  'authenticated callers cannot insert profile snapshots directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.company_profile_snapshots', 'update'),
  'authenticated callers cannot update profile snapshots directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.company_profile_snapshots', 'delete'),
  'authenticated callers cannot delete profile snapshots directly'
);
select ok(
  not has_table_privilege('service_role', 'public.company_profile_snapshots', 'insert'),
  'service role writes are forced through the reviewed RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.persist_company_profile_snapshot(uuid,uuid,uuid,timestamptz,jsonb,jsonb)',
    'execute'
  ),
  'service role may execute the persistence RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.persist_company_profile_snapshot(uuid,uuid,uuid,timestamptz,jsonb,jsonb)',
    'execute'
  ),
  'authenticated callers cannot execute the persistence RPC'
);

select throws_ok(
  $$insert into public.company_profile_snapshots (
    workspace_id,
    project_id,
    idempotency_key,
    request_fingerprint,
    capture_method_version,
    captured_at,
    crawl_result,
    profile_method_version,
    profile
  ) select
    'b2000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000002',
    'b4000000-0000-4000-8000-000000000099',
    repeat('a', 64),
    'native-entry-page-v1',
    '2026-09-12T13:00:00Z'::timestamptz,
    crawl_result,
    'company-profile-v2',
    profile
  from profile_provenance_fixture$$,
  '23503',
  null,
  'profile snapshot cannot reference a project from another workspace'
);

select is(
  (
    public.persist_company_profile_snapshot(
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000001',
      '2026-09-12T13:00:00Z'::timestamptz,
      (select crawl_result from profile_provenance_fixture),
      (select profile from profile_provenance_fixture)
    ) ->> 'replayed'
  ),
  'false',
  'first persistence call creates a new immutable snapshot'
);
select is(
  (select count(*) from public.company_profile_snapshots),
  1::bigint,
  'one snapshot is durable after first persistence'
);
select is(
  (
    public.persist_company_profile_snapshot(
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000001',
      '2026-09-12T13:00:00Z'::timestamptz,
      (select crawl_result from profile_provenance_fixture),
      (select profile from profile_provenance_fixture)
    ) ->> 'replayed'
  ),
  'true',
  'identical idempotent replay returns the existing snapshot'
);
select is(
  (select count(*) from public.company_profile_snapshots),
  1::bigint,
  'idempotent replay does not duplicate evidence'
);

select throws_ok(
  $$select public.persist_company_profile_snapshot(
    'b2000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b4000000-0000-4000-8000-000000000001',
    '2026-09-12T13:00:00Z'::timestamptz,
    (select crawl_result from profile_provenance_fixture),
    jsonb_set(
      (select profile from profile_provenance_fixture),
      '{fields,companyName,values,0,value}',
      '"Forged Name"'::jsonb
    )
  )$$,
  '22023',
  'Idempotency key reused with different company profile snapshot',
  'same idempotency key cannot rewrite interpreted evidence'
);

select throws_ok(
  $$update public.company_profile_snapshots
    set review_state = 'accepted'$$,
  '22023',
  'Company profile snapshots are immutable',
  'profile snapshot review state is not silently mutable in C5'
);

select throws_ok(
  $$select public.persist_company_profile_snapshot(
    'b2000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000002',
    'b4000000-0000-4000-8000-000000000002',
    '2026-09-12T13:00:00Z'::timestamptz,
    (select crawl_result from profile_provenance_fixture),
    (select profile from profile_provenance_fixture)
  )$$,
  '23503',
  'Project not found for company profile snapshot',
  'RPC rejects cross-workspace project identity'
);

set local role anon;
select throws_ok(
  'select * from public.company_profile_snapshots',
  '42501',
  null,
  'anonymous profile snapshot reads are denied'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.company_profile_snapshots),
  1::bigint,
  'workspace member sees own profile snapshot'
);
select throws_ok(
  $$insert into public.company_profile_snapshots (
    workspace_id,
    project_id,
    idempotency_key,
    request_fingerprint,
    capture_method_version,
    captured_at,
    crawl_result,
    profile_method_version,
    profile
  ) values (
    'b2000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b4000000-0000-4000-8000-000000000003',
    repeat('c', 64),
    'native-entry-page-v1',
    now(),
    '{"ok":true,"pages":[{}]}'::jsonb,
    'company-profile-v2',
    '{"methodVersion":"company-profile-v2","fields":{},"excludedPages":[]}'::jsonb
  )$$,
  '42501',
  null,
  'workspace member cannot write profile evidence directly'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000003', true);
select is(
  (select count(*) from public.company_profile_snapshots),
  0::bigint,
  'nonmember cannot read another workspace profile snapshot'
);

reset role;
delete from public.projects
where workspace_id = 'b2000000-0000-4000-8000-000000000001'
  and id = 'b3000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from public.company_profile_snapshots),
  0::bigint,
  'project deletion cascades its profile evidence without orphan rows'
);

select * from finish();
rollback;
