-- Test-only fixtures. Run on disposable local Supabase, never customer data.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'scan-owner-a@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'scan-owner-b@example.test'),
  ('a1000000-0000-4000-8000-000000000003', 'scan-outsider@example.test');

insert into public.workspaces (id, name, created_by) values
  ('a2000000-0000-4000-8000-000000000001', 'Scan Agency A', 'a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002', 'Scan Agency B', 'a1000000-0000-4000-8000-000000000002');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'owner');

insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Scan Client A', 'scan-a.example.test', 'a1000000-0000-4000-8000-000000000001'),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'Scan Client B', 'scan-b.example.test', 'a1000000-0000-4000-8000-000000000002');

select ok(
  bool_and(relrowsecurity),
  'all scan persistence tables enable RLS'
)
from pg_class
where oid in (
  'public.scans'::regclass,
  'public.scan_queries'::regclass,
  'public.scan_attempts'::regclass,
  'public.scan_attempt_queries'::regclass
);

select ok(
  not has_table_privilege('authenticated', 'public.scans', 'insert'),
  'authenticated callers cannot enqueue scans directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.scan_queries', 'insert'),
  'authenticated callers cannot insert query snapshots directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.scan_attempts', 'insert'),
  'authenticated callers cannot create attempts directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.scan_attempt_queries', 'insert'),
  'authenticated callers cannot reserve observation identities directly'
);

select throws_ok(
  $$insert into public.scans (
    workspace_id,
    project_id,
    idempotency_key,
    request_fingerprint,
    prompt_method_version,
    profile_method_version,
    query_count,
    created_by
  ) values (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000099',
    repeat('a', 64),
    'niche-prompts-v1',
    'company-profile-v2',
    1,
    'a1000000-0000-4000-8000-000000000001'
  )$$,
  '23503',
  null,
  'scan cannot reference a project from another workspace'
);

select throws_ok(
  $$insert into public.scans (
    workspace_id,
    project_id,
    idempotency_key,
    request_fingerprint,
    prompt_method_version,
    profile_method_version,
    query_count,
    created_by
  ) values (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000098',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'niche-prompts-v1',
    'company-profile-v2',
    1,
    'a1000000-0000-4000-8000-000000000001'
  )$$,
  '23514',
  null,
  'request fingerprint must be lowercase SHA-256 hex'
);

insert into public.scans (
  id,
  workspace_id,
  project_id,
  idempotency_key,
  request_fingerprint,
  prompt_method_version,
  profile_method_version,
  query_count,
  created_by
) values
  (
    'a5000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    repeat('a', 64),
    'niche-prompts-v1',
    'company-profile-v2',
    2,
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a5000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000002',
    'a3000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000001',
    repeat('b', 64),
    'niche-prompts-v1',
    'company-profile-v2',
    1,
    'a1000000-0000-4000-8000-000000000002'
  );

select lives_ok(
  $$insert into public.scans (
    workspace_id,
    project_id,
    idempotency_key,
    request_fingerprint,
    prompt_method_version,
    profile_method_version,
    query_count,
    created_by
  ) values (
    'a2000000-0000-4000-8000-000000000002',
    'a3000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000009',
    repeat('c', 64),
    'niche-prompts-v1',
    'company-profile-v2',
    0,
    'a1000000-0000-4000-8000-000000000002'
  )$$,
  'zero-query scan snapshot is representable without fabricated queries'
);

select throws_ok(
  $$insert into public.scans (
    workspace_id,
    project_id,
    idempotency_key,
    request_fingerprint,
    prompt_method_version,
    profile_method_version,
    query_count,
    created_by
  ) values (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    repeat('d', 64),
    'niche-prompts-v1',
    'company-profile-v2',
    1,
    'a1000000-0000-4000-8000-000000000001'
  )$$,
  '23505',
  null,
  'scan idempotency key is unique inside a workspace'
);

insert into public.scan_queries (
  workspace_id,
  scan_id,
  query_ordinal,
  query_id,
  query_version,
  query_text
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    0,
    'query-a-1',
    'category@v1',
    'What are the best platforms for Scan Client A?'
  ),
  (
    'a2000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    1,
    'query-a-2',
    'buyer@v1',
    'Which platform should a buyer choose for Scan Client A use cases?'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a5000000-0000-4000-8000-000000000002',
    0,
    'query-b-1',
    'category@v1',
    'What are the best platforms for Scan Client B?'
  );

select throws_ok(
  $$insert into public.scan_queries (
    workspace_id,
    scan_id,
    query_ordinal,
    query_id,
    query_version,
    query_text
  ) values (
    'a2000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000002',
    1,
    'cross-tenant-query',
    'category@v1',
    'Cross tenant query'
  )$$,
  '23503',
  null,
  'query snapshot cannot cross tenant scan identity'
);

insert into public.scan_attempts (
  id,
  workspace_id,
  scan_id,
  attempt_number
) values
  (
    'a6000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    1
  ),
  (
    'a6000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000002',
    'a5000000-0000-4000-8000-000000000002',
    1
  );

insert into public.scan_attempt_queries (
  workspace_id,
  scan_id,
  attempt_id,
  query_ordinal,
  observation_id
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    0,
    'a7000000-0000-4000-8000-000000000001'
  ),
  (
    'a2000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    1,
    'a7000000-0000-4000-8000-000000000002'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a5000000-0000-4000-8000-000000000002',
    'a6000000-0000-4000-8000-000000000002',
    0,
    'a7000000-0000-4000-8000-000000000003'
  );

select throws_ok(
  $$insert into public.scan_attempt_queries (
    workspace_id,
    scan_id,
    attempt_id,
    query_ordinal,
    observation_id
  ) values (
    'a2000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000002',
    0,
    'a7000000-0000-4000-8000-000000000099'
  )$$,
  '23503',
  null,
  'attempt query cannot combine identities from different tenants'
);

select throws_ok(
  $$insert into public.scan_attempt_queries (
    workspace_id,
    scan_id,
    attempt_id,
    query_ordinal,
    observation_id,
    state
  ) values (
    'a2000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    0,
    'a7000000-0000-4000-8000-000000000098',
    'boundary_failure'
  )$$,
  '23514',
  null,
  'boundary failures require an explicit safe failure code'
);

select throws_ok(
  $$update public.scans
    set request_fingerprint = repeat('f', 64)
    where id = 'a5000000-0000-4000-8000-000000000001'$$,
  '22023',
  'Scan request identity is immutable',
  'request fingerprint cannot be rewritten'
);
select lives_ok(
  $$update public.scans
    set state = 'running'
    where id = 'a5000000-0000-4000-8000-000000000001'$$,
  'queued scan may enter running'
);
select lives_ok(
  $$update public.scans
    set state = 'completed'
    where id = 'a5000000-0000-4000-8000-000000000001'$$,
  'running scan may complete'
);
select throws_ok(
  $$update public.scans
    set state = 'running'
    where id = 'a5000000-0000-4000-8000-000000000001'$$,
  '22023',
  'Invalid scan state transition: completed -> running',
  'terminal scan cannot return to running'
);

select throws_ok(
  $$update public.scan_queries
    set query_text = 'Rewritten prompt'
    where scan_id = 'a5000000-0000-4000-8000-000000000001'
      and query_ordinal = 0$$,
  '22023',
  'Scan query snapshots are immutable',
  'planned query snapshot cannot be rewritten'
);

select lives_ok(
  $$update public.scan_attempts
    set state = 'running', started_at = now()
    where id = 'a6000000-0000-4000-8000-000000000001'$$,
  'queued attempt may enter running'
);
select lives_ok(
  $$update public.scan_attempts
    set state = 'completed', finished_at = now()
    where id = 'a6000000-0000-4000-8000-000000000001'$$,
  'running attempt may complete'
);
select throws_ok(
  $$update public.scan_attempts
    set state = 'running'
    where id = 'a6000000-0000-4000-8000-000000000001'$$,
  '22023',
  'Invalid scan attempt state transition: completed -> running',
  'terminal attempt cannot restart'
);

select throws_ok(
  $$update public.scan_attempt_queries
    set observation_id = 'a7000000-0000-4000-8000-000000000009'
    where observation_id = 'a7000000-0000-4000-8000-000000000001'$$,
  '22023',
  'Scan observation identity is immutable',
  'observation identity cannot be rewritten'
);
select lives_ok(
  $$update public.scan_attempt_queries
    set state = 'running'
    where observation_id = 'a7000000-0000-4000-8000-000000000001'$$,
  'unattempted query may enter running'
);
select lives_ok(
  $$update public.scan_attempt_queries
    set state = 'answered'
    where observation_id = 'a7000000-0000-4000-8000-000000000001'$$,
  'running query may become answered'
);
select throws_ok(
  $$update public.scan_attempt_queries
    set state = 'running'
    where observation_id = 'a7000000-0000-4000-8000-000000000001'$$,
  '22023',
  'Invalid scan query state transition: answered -> running',
  'terminal query outcome cannot restart'
);
select lives_ok(
  $$update public.scan_attempt_queries
    set state = 'boundary_failure', boundary_failure_code = 'invalid_request'
    where observation_id = 'a7000000-0000-4000-8000-000000000002'$$,
  'unattempted query may record an explicit boundary failure'
);

set local role anon;
select throws_ok('select * from public.scans', '42501', null, 'anonymous scan reads denied');
select throws_ok('select * from public.scan_queries', '42501', null, 'anonymous query reads denied');
select throws_ok('select * from public.scan_attempts', '42501', null, 'anonymous attempt reads denied');
select throws_ok('select * from public.scan_attempt_queries', '42501', null, 'anonymous observation identity reads denied');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select is((select count(*) from public.scans), 1::bigint, 'member sees only own workspace scan');
select is((select count(*) from public.scan_queries), 2::bigint, 'member sees only own query snapshots');
select is((select count(*) from public.scan_attempts), 1::bigint, 'member sees only own scan attempts');
select is((select count(*) from public.scan_attempt_queries), 2::bigint, 'member sees only own observation identities');
select throws_ok(
  $$insert into public.scans (
    workspace_id,
    project_id,
    idempotency_key,
    request_fingerprint,
    prompt_method_version,
    profile_method_version,
    query_count,
    created_by
  ) values (
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000010',
    repeat('e', 64),
    'niche-prompts-v1',
    'company-profile-v2',
    1,
    'a1000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  null,
  'member cannot enqueue without future C2 reservation boundary'
);
select throws_ok(
  $$update public.scans set state = 'cancelled'$$,
  '42501',
  null,
  'member cannot mutate scan state directly'
);
select throws_ok(
  $$delete from public.scans$$,
  '42501',
  null,
  'member cannot delete durable scan records directly'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","user_metadata":{"workspace_id":"a2000000-0000-4000-8000-000000000001","role":"owner"}}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000003',
  true
);
select is((select count(*) from public.scans), 0::bigint, 'editable metadata cannot grant scan visibility');
select is((select count(*) from public.scan_queries), 0::bigint, 'editable metadata cannot grant query visibility');

reset role;
delete from public.workspace_memberships
where workspace_id = 'a2000000-0000-4000-8000-000000000001'
  and user_id = 'a1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{}', true);
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select is((select count(*) from public.scans), 0::bigint, 'revocation immediately removes scan visibility');
select is((select count(*) from public.scan_attempt_queries), 0::bigint, 'revocation immediately removes observation identity visibility');

select * from finish();
rollback;
