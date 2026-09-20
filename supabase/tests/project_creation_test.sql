-- Test-only fixtures. Run on disposable local Supabase, never customer data.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'project-owner-a@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'project-owner-b@example.test'),
  ('91000000-0000-4000-8000-000000000003', 'project-outsider@example.test');
insert into public.workspaces (id, name, created_by) values
  ('92000000-0000-4000-8000-000000000001', 'Project Agency A', '91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002', 'Project Agency B', '91000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'owner'),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'owner');

select ok(
  not has_table_privilege('authenticated', 'public.projects', 'insert'),
  'authenticated clients cannot bypass the project creation RPC'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'app_private.project_creation_requests',
    'select'
  ),
  'idempotency records remain private'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_project(uuid,text,text,uuid)',
    'execute'
  ),
  'authenticated callers can execute project creation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_project(uuid,text,text,uuid)',
    'execute'
  ),
  'anonymous callers cannot execute project creation'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
select lives_ok(
  $$select public.create_project(
    '92000000-0000-4000-8000-000000000001',
    'Client A',
    'client-a.com',
    '93000000-0000-4000-8000-000000000001'
  )$$,
  'member can create a project in the current workspace'
);
select is(
  (
    select public.create_project(
      '92000000-0000-4000-8000-000000000001',
      'Client A',
      'client-a.com',
      '93000000-0000-4000-8000-000000000001'
    )
  ),
  (select id from public.projects where tracked_domain = 'client-a.com'),
  'same idempotency key and payload returns the same project'
);
select is(
  (select count(*) from public.projects),
  1::bigint,
  'replay creates no duplicate project'
);
select throws_ok(
  $$select public.create_project(
    '92000000-0000-4000-8000-000000000001',
    'Changed payload',
    'client-a.com',
    '93000000-0000-4000-8000-000000000001'
  )$$,
  '22023',
  'Idempotency key reused with different project payload',
  'same idempotency key cannot change the project payload'
);
select throws_ok(
  $$select public.create_project(
    '92000000-0000-4000-8000-000000000001',
    'Duplicate domain',
    'client-a.com',
    '93000000-0000-4000-8000-000000000002'
  )$$,
  '22023',
  'Tracked domain already exists in workspace',
  'a workspace cannot track the same domain twice'
);
select throws_ok(
  $$insert into public.projects (workspace_id, name, tracked_domain)
    values (
      '92000000-0000-4000-8000-000000000001',
      'Bypass',
      'bypass.example.com'
    )$$,
  '42501',
  null,
  'direct project inserts remain denied'
);
select throws_ok(
  $$select public.create_project(
    '92000000-0000-4000-8000-000000000002',
    'Cross tenant',
    'cross-tenant.com',
    '93000000-0000-4000-8000-000000000003'
  )$$,
  '42501',
  null,
  'nonmembers cannot create projects in another workspace'
);

select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000002',
  true
);
select lives_ok(
  $$select public.create_project(
    '92000000-0000-4000-8000-000000000002',
    'Client B',
    'client-b.com',
    '93000000-0000-4000-8000-000000000001'
  )$$,
  'different users may reuse the same idempotency UUID'
);

select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select count(*) from public.projects),
  1::bigint,
  'project listing remains tenant scoped under RLS'
);
select is(
  (select tracked_domain from public.projects),
  'client-a.com',
  'member sees only the project from their workspace'
);

select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000003',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated","user_metadata":{"workspace_id":"92000000-0000-4000-8000-000000000001","role":"owner"}}',
  true
);
select throws_ok(
  $$select public.create_project(
    '92000000-0000-4000-8000-000000000001',
    'Forged metadata',
    'forged-metadata.com',
    '93000000-0000-4000-8000-000000000004'
  )$$,
  '42501',
  null,
  'editable metadata cannot grant project access'
);

reset role;
delete from public.workspace_memberships
where workspace_id = '92000000-0000-4000-8000-000000000001'
  and user_id = '91000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{}', true);
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
select throws_ok(
  $$select public.create_project(
    '92000000-0000-4000-8000-000000000001',
    'Client A',
    'client-a.com',
    '93000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  null,
  'revocation blocks an idempotent replay immediately'
);

select * from finish();
rollback;
