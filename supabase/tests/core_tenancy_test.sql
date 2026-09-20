-- Current tenancy/security contract. Run only against disposable local Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'owner-a@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'owner-b@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'member-a@example.test'),
  ('00000000-0000-4000-8000-000000000004', 'outsider@example.test');

insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-000000000001', 'Owner A'),
  ('00000000-0000-4000-8000-000000000002', 'Owner B');

insert into public.workspaces (id, name, created_by) values
  ('10000000-0000-4000-8000-000000000001', 'Agency A', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', 'Agency B', '00000000-0000-4000-8000-000000000002');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'owner'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'owner'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'member');

insert into public.projects (id, workspace_id, name, tracked_domain, created_by) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Client A', 'a.example.test', '00000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Client B', 'b.example.test', '00000000-0000-4000-8000-000000000002');

select ok(
  bool_and(relrowsecurity),
  'all exposed tenant tables enable RLS'
)
from pg_class
where oid in (
  'public.profiles'::regclass,
  'public.workspaces'::regclass,
  'public.workspace_memberships'::regclass,
  'public.projects'::regclass
);
select ok(
  not has_table_privilege('authenticated', 'public.projects', 'insert'),
  'authenticated callers cannot bypass replay-safe project creation'
);
select ok(
  not has_table_privilege('authenticated', 'app_private.workspace_bootstrap_requests', 'select')
  and not has_table_privilege('authenticated', 'app_private.project_creation_requests', 'select'),
  'idempotency state is not client readable'
);
select ok(
  has_function_privilege('authenticated', 'public.create_workspace(text,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.create_project(uuid,text,text,uuid)', 'execute'),
  'authenticated callers can use the public RPC entrypoints'
);
select ok(
  not has_function_privilege('anon', 'public.create_workspace(text,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.create_project(uuid,text,text,uuid)', 'execute'),
  'anonymous callers cannot execute tenant mutation RPCs'
);
select ok(
  not workspace_proc.prosecdef and not project_proc.prosecdef,
  'public RPC wrappers remain SECURITY INVOKER'
)
from pg_proc workspace_proc, pg_proc project_proc
where workspace_proc.oid = 'public.create_workspace(text,uuid)'::regprocedure
  and project_proc.oid = 'public.create_project(uuid,text,text,uuid)'::regprocedure;

set local role anon;
select throws_ok('select * from public.profiles', '42501', null, 'anonymous profile reads denied');
select throws_ok('select * from public.workspaces', '42501', null, 'anonymous workspace reads denied');
select throws_ok('select * from public.workspace_memberships', '42501', null, 'anonymous membership reads denied');
select throws_ok('select * from public.projects', '42501', null, 'anonymous project reads denied');
select throws_ok(
  $$select public.create_workspace('Bad','30000000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'anonymous workspace bootstrap denied'
);
select throws_ok(
  $$select public.create_project(
    '10000000-0000-4000-8000-000000000001',
    'Bad',
    'bad.example.test',
    '30000000-0000-4000-8000-000000000002'
  )$$,
  '42501',
  null,
  'anonymous project creation denied'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select is(current_user::text, 'authenticated', 'security tests use the real client role');
select is((select count(*) from public.workspaces), 1::bigint, 'member sees one workspace');
select is((select name from public.workspaces), 'Agency A', 'member sees only their workspace');
select is((select count(*) from public.workspace_memberships), 1::bigint, 'membership reads are self-only');
select is((select name from public.projects), 'Client A', 'cross-tenant project is hidden');

select lives_ok(
  $$insert into public.profiles (display_name) values ('Member A')$$,
  'member can create their own profile'
);
select is(
  (select id from public.profiles),
  '00000000-0000-4000-8000-000000000003'::uuid,
  'profile identity comes from auth.uid'
);
select throws_ok(
  $$insert into public.profiles (id, display_name)
    values ('00000000-0000-4000-8000-000000000004', 'Forged')$$,
  '42501',
  null,
  'caller cannot choose another profile identity'
);

select throws_ok(
  $$insert into public.projects (workspace_id, name, tracked_domain)
    values ('10000000-0000-4000-8000-000000000001', 'Bypass', 'bypass.example.test')$$,
  '42501',
  null,
  'direct project insertion is denied even for a member'
);
select lives_ok(
  $$select public.create_project(
    '10000000-0000-4000-8000-000000000001',
    'Member project',
    'member.example.test',
    '30000000-0000-4000-8000-000000000003'
  )$$,
  'member creates a project through the replay-safe RPC'
);
select is(
  (select created_by from public.projects where name = 'Member project'),
  '00000000-0000-4000-8000-000000000003'::uuid,
  'project creator comes from auth.uid'
);
select throws_ok(
  $$select public.create_project(
    '10000000-0000-4000-8000-000000000002',
    'Cross tenant',
    'cross-tenant.example.test',
    '30000000-0000-4000-8000-000000000004'
  )$$,
  '42501',
  null,
  'member cannot create a project in another workspace'
);

select results_eq(
  $$update public.workspaces set name = 'Hijack' returning id$$,
  $$select null::uuid where false$$,
  'nonowner cannot rename a workspace'
);
select throws_ok(
  $$update public.workspace_memberships set role = 'owner'$$,
  '42501',
  null,
  'member cannot self-promote'
);
select throws_ok(
  $$insert into public.workspace_memberships (workspace_id, user_id, role)
    values (
      '10000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      'owner'
    )$$,
  '42501',
  null,
  'member cannot join another workspace directly'
);
select throws_ok('delete from public.workspace_memberships', '42501', null, 'membership deletion denied');

select throws_ok(
  $$update public.projects
    set workspace_id = '10000000-0000-4000-8000-000000000002'
    where id = '20000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'project tenant is immutable to clients'
);
select throws_ok(
  $$update public.projects set created_at = now()$$,
  '42501',
  null,
  'project timestamps are immutable to clients'
);
select results_eq(
  $$update public.projects
    set name = 'Changed A'
    where id = '20000000-0000-4000-8000-000000000001'
    returning id$$,
  $$select '20000000-0000-4000-8000-000000000001'::uuid$$,
  'member can update a same-tenant project'
);
select results_eq(
  $$update public.projects
    set name = 'Hijacked B'
    where id = '20000000-0000-4000-8000-000000000002'
    returning id$$,
  $$select null::uuid where false$$,
  'cross-tenant project update affects no rows'
);
select results_eq(
  $$delete from public.projects
    where id = '20000000-0000-4000-8000-000000000002'
    returning id$$,
  $$select null::uuid where false$$,
  'cross-tenant project delete affects no rows'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select lives_ok($$update public.workspaces set name = 'Renamed A'$$, 'owner can rename their workspace');
select is((select name from public.workspaces), 'Renamed A', 'owner rename persists');

reset role;
delete from public.workspace_memberships
where workspace_id = '10000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.workspaces), 0::bigint, 'revoked member loses workspace reads immediately');
select is((select count(*) from public.projects), 0::bigint, 'revoked member loses project reads immediately');
select throws_ok(
  $$select public.create_project(
    '10000000-0000-4000-8000-000000000001',
    'Member project',
    'member.example.test',
    '30000000-0000-4000-8000-000000000003'
  )$$,
  '42501',
  null,
  'revocation blocks an idempotent project replay immediately'
);
select results_eq(
  $$update public.projects set name = 'Revoked' returning id$$,
  $$select null::uuid where false$$,
  'revoked member cannot update projects'
);
select results_eq(
  $$delete from public.projects returning id$$,
  $$select null::uuid where false$$,
  'revoked member cannot delete projects'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated","user_metadata":{"workspace_id":"10000000-0000-4000-8000-000000000001","role":"owner"}}',
  true
);
select is((select count(*) from public.workspaces), 0::bigint, 'editable metadata cannot grant workspace access');
select is((select count(*) from public.projects), 0::bigint, 'editable metadata cannot grant project access');
select throws_ok(
  $$select public.create_project(
    '10000000-0000-4000-8000-000000000001',
    'Forged metadata',
    'forged.example.test',
    '30000000-0000-4000-8000-000000000005'
  )$$,
  '42501',
  null,
  'editable metadata cannot authorize project creation'
);

select set_config('request.jwt.claims', '{}', true);
select lives_ok(
  $$select public.create_workspace(
    'New agency',
    '30000000-0000-4000-8000-000000000006'
  )$$,
  'signed-in nonmember can bootstrap a workspace'
);
select is((select count(*) from public.workspaces), 1::bigint, 'bootstrap creates one visible workspace');
select is((select role from public.workspace_memberships), 'owner', 'bootstrap creates owner membership');
select is(
  public.create_workspace('New agency', '30000000-0000-4000-8000-000000000006'),
  (select id from public.workspaces where name = 'New agency'),
  'workspace bootstrap replay returns the same workspace'
);
select throws_ok(
  $$select public.create_workspace(
    'Different agency',
    '30000000-0000-4000-8000-000000000006'
  )$$,
  '22023',
  'Idempotency key reused with different workspace name',
  'workspace idempotency key cannot change payload'
);
select throws_ok(
  'select * from app_private.workspace_bootstrap_requests',
  '42501',
  null,
  'client cannot read private workspace idempotency state'
);
select throws_ok(
  'select * from app_private.project_creation_requests',
  '42501',
  null,
  'client cannot read private project idempotency state'
);

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.create_workspace(
    'Missing identity',
    '30000000-0000-4000-8000-000000000007'
  )$$,
  '42501',
  null,
  'authenticated role without subject cannot bootstrap a workspace'
);
select is((select count(*) from public.projects), 0::bigint, 'missing identity sees no tenant project data');

reset role;
select is(
  (select name from public.projects where id = '20000000-0000-4000-8000-000000000002'),
  'Client B',
  'cross-tenant mutation attempts left Agency B unchanged'
);
select is(
  (select count(*) from public.projects where name = 'Member project'),
  1::bigint,
  'revocation retains the member-created project without exposing it'
);

select * from finish();
rollback;
