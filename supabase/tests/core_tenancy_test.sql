-- Test-only fixtures. Run on disposable local Supabase, never a customer project.
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

select ok(bool_and(relrowsecurity), 'all four tables enable RLS')
from pg_class where oid in ('public.profiles'::regclass, 'public.workspaces'::regclass,
  'public.workspace_memberships'::regclass, 'public.projects'::regclass);
select throws_ok($$insert into public.workspace_memberships values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'owner', now(), now())$$,
  '23505', null, 'membership cannot be duplicated');
select throws_ok($$insert into public.workspace_memberships (workspace_id,user_id,role) values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','admin')$$,
  '23514', null, 'unknown membership role is rejected');
select throws_ok($$insert into public.profiles (id) values ('00000000-0000-4000-8000-000000000099')$$,
  '23503', null, 'profile must reference a real Auth user');
select ok(not has_schema_privilege('anon', 'app_private', 'usage'),
  'anonymous callers cannot access the private schema');
select ok(not has_function_privilege('anon', 'public.create_workspace(text)', 'execute'),
  'anonymous callers have no bootstrap execution grant');
select ok(not has_function_privilege('authenticated', 'app_private.touch_updated_at()', 'execute'),
  'clients cannot directly execute the timestamp trigger function');
select ok(not prosecdef, 'public bootstrap wrapper uses invoker privileges')
from pg_proc where oid = 'public.create_workspace(text)'::regprocedure;

set local role anon;
select throws_ok('select * from public.profiles', '42501', null, 'anonymous profile reads denied');
select throws_ok('select * from public.workspaces', '42501', null, 'anonymous workspace reads denied');
select throws_ok('select * from public.workspace_memberships', '42501', null, 'anonymous membership reads denied');
select throws_ok('select * from public.projects', '42501', null, 'anonymous project reads denied');
select throws_ok($$insert into public.projects (workspace_id,name,tracked_domain) values ('10000000-0000-4000-8000-000000000001','bad','bad.example.test')$$,
  '42501', null, 'anonymous project insert denied');
select throws_ok($$update public.projects set name='bad'$$, '42501', null, 'anonymous update denied');
select throws_ok('delete from public.projects', '42501', null, 'anonymous delete denied');
select throws_ok($$select public.create_workspace('bad')$$, '42501', null, 'anonymous bootstrap denied');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select is(current_user::text, 'authenticated', 'allow/deny tests use the actual client role');
select is((select count(*) from public.profiles), 0::bigint, 'member cannot read other profiles');
select lives_ok($$insert into public.profiles (display_name) values ('Member A')$$, 'member creates own profile');
select is((select id from public.profiles), '00000000-0000-4000-8000-000000000003'::uuid, 'profile identity comes from auth.uid');
select lives_ok($$update public.profiles set display_name='Changed'$$, 'member updates own profile');
select is((select display_name from public.profiles), 'Changed', 'own profile update persisted');
select results_eq($$update public.profiles set display_name='hijacked' where id='00000000-0000-4000-8000-000000000001' returning id$$,
  $$select null::uuid where false$$, 'another user profile cannot be updated');
select throws_ok($$insert into public.profiles (id,display_name) values ('00000000-0000-4000-8000-000000000004','forged')$$,
  '42501', null, 'cannot choose another profile identity');
select throws_ok('delete from public.profiles', '42501', null, 'client profile deletion denied');
select is((select count(*) from public.workspaces), 1::bigint, 'member sees only Agency A');
select is((select name from public.workspaces), 'Agency A', 'correct workspace is visible');
select is((select count(*) from public.workspace_memberships), 1::bigint, 'membership visibility is self-only without recursion');
select is((select name from public.projects), 'Client A', 'cross-tenant project is hidden');
select results_eq($$update public.workspaces set name='hijack' returning id$$,
  $$select null::uuid where false$$, 'nonowner cannot rename workspace');
select throws_ok($$insert into public.workspaces (name) values ('orphan')$$, '42501', null, 'direct workspace insert denied');
select throws_ok('delete from public.workspaces', '42501', null, 'direct workspace delete denied');
select throws_ok($$update public.workspace_memberships set role='owner'$$, '42501', null, 'self-promotion denied');
select throws_ok($$insert into public.workspace_memberships (workspace_id,user_id,role) values ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','owner')$$,
  '42501', null, 'joining another workspace denied');
select throws_ok('delete from public.workspace_memberships', '42501', null, 'direct membership deletion denied');
select lives_ok($$insert into public.projects (workspace_id,name,tracked_domain) values ('10000000-0000-4000-8000-000000000001','Member project','member.example.test')$$,
  'member inserts a project in own workspace');
select is((select created_by from public.projects where name='Member project'),
  '00000000-0000-4000-8000-000000000003'::uuid, 'project creator is authenticated identity');
select throws_ok($$insert into public.projects (workspace_id,name,tracked_domain) values ('10000000-0000-4000-8000-000000000002','bad','bad.example.test')$$,
  '42501', null, 'cross-tenant project insert denied');
select throws_ok($$insert into public.projects (workspace_id,name,tracked_domain,created_by) values ('10000000-0000-4000-8000-000000000001','bad','bad.example.test','00000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'forged creator denied');
select throws_ok($$update public.projects set created_at=now()$$, '42501', null, 'client cannot rewrite timestamps');
select throws_ok($$update public.projects set workspace_id='10000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'client cannot move projects across tenants');
select throws_ok($$update public.projects set tracked_domain='https://EXAMPLE.test/path'$$,
  '23514', null, 'domain must be a normalized DNS hostname');
select throws_ok($$update public.projects set name='   '$$, '23514', null, 'blank project name rejected');
select results_eq($$update public.projects set name='changed' where id='20000000-0000-4000-8000-000000000001' returning id$$,
  $$select '20000000-0000-4000-8000-000000000001'::uuid$$, 'same-tenant project update allowed');
select results_eq($$update public.projects set name='hijack' where id='20000000-0000-4000-8000-000000000002' returning id$$,
  $$select null::uuid where false$$, 'cross-tenant project update affects no rows');
select results_eq($$delete from public.projects where id='20000000-0000-4000-8000-000000000002' returning id$$,
  $$select null::uuid where false$$, 'cross-tenant project delete affects no rows');
select results_eq($$delete from public.projects where id='20000000-0000-4000-8000-000000000001' returning id$$,
  $$select '20000000-0000-4000-8000-000000000001'::uuid$$, 'same-tenant project delete allowed');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select lives_ok($$update public.workspaces set name='Renamed A'$$, 'owner renames workspace');
select is((select name from public.workspaces), 'Renamed A', 'owner rename persisted');
select throws_ok('delete from public.workspace_memberships', '42501', null, 'even the owner cannot remove the last owner directly');

-- The same user belongs to both tenants: grants must still prevent reassignment.
reset role;
insert into public.workspace_memberships (workspace_id,user_id,role) values
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','member');
set local role authenticated;
select throws_ok($$update public.projects set workspace_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'even a member of both tenants cannot reassign a project');

-- Revocation applies to projects created by that member too.
reset role;
delete from public.workspace_memberships where user_id='00000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.projects), 0::bigint, 'revoked member loses all project reads');
select is((select count(*) from public.workspaces), 0::bigint, 'revoked member loses workspace reads');
select throws_ok($$insert into public.projects (workspace_id,name,tracked_domain) values ('10000000-0000-4000-8000-000000000001','bad','bad.example.test')$$,
  '42501', null, 'revoked member loses insert rights');
select results_eq($$update public.projects set name='bad' returning id$$,
  $$select null::uuid where false$$, 'revoked member loses update rights');
select results_eq($$delete from public.projects returning id$$,
  $$select null::uuid where false$$, 'revoked member loses delete rights');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.workspaces), 0::bigint, 'nonmember sees no workspaces');
select is((select count(*) from public.projects), 0::bigint, 'nonmember sees no projects');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated","user_metadata":{"workspace_id":"10000000-0000-4000-8000-000000000001","role":"owner"}}', true);
select is((select count(*) from public.workspaces), 0::bigint, 'editable metadata cannot grant workspace access');
select throws_ok($$insert into public.projects (workspace_id,name,tracked_domain) values ('10000000-0000-4000-8000-000000000001','forged membership','forged.example.test')$$,
  '42501', null, 'editable metadata cannot authorize project creation');
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.create_workspace(' ')$$, '23514', null, 'invalid bootstrap rejected');
select is((select count(*) from public.workspace_memberships), 0::bigint, 'failed bootstrap left no membership');

-- Fail the second bootstrap insert after the workspace insert has succeeded.
-- This test-only trigger and its function are removed and the suite rolls back.
reset role;
create function app_private.test_reject_membership()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Test-only membership failure' using errcode = 'P0001';
end;
$$;
revoke all on function app_private.test_reject_membership() from public, anon, authenticated;
create trigger test_reject_membership before insert on public.workspace_memberships
  for each row execute function app_private.test_reject_membership();
set local role authenticated;
select throws_ok($$select public.create_workspace('Rollback test agency')$$,
  'P0001', 'Test-only membership failure', 'membership failure propagates from bootstrap');
reset role;
select is((select count(*) from public.workspaces where name='Rollback test agency'),
  0::bigint, 'second-insert failure rolls back the workspace as verified without RLS');
select is((select count(*) from public.workspace_memberships where user_id='00000000-0000-4000-8000-000000000004'),
  0::bigint, 'second-insert failure leaves no owner membership');
drop trigger test_reject_membership on public.workspace_memberships;
drop function app_private.test_reject_membership();
set local role authenticated;
select lives_ok($$select public.create_workspace('New agency')$$, 'signed-in nonmember can bootstrap own workspace');
select is((select count(*) from public.workspaces), 1::bigint, 'bootstrap creates exactly one visible workspace');
select is((select role from public.workspace_memberships), 'owner', 'bootstrap creates owner membership');
select is((select created_by from public.workspaces), '00000000-0000-4000-8000-000000000004'::uuid, 'bootstrap derives creator from auth.uid');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.create_workspace('missing identity')$$, '42501', null, 'bootstrap rejects missing identity even with authenticated role');
select is((select count(*) from public.projects), 0::bigint, 'missing identity cannot read tenant data');

reset role;
select is((select count(*) from public.workspaces), 3::bigint, 'failed bootstrap left no orphan workspace');
select is((select name from public.projects where id='20000000-0000-4000-8000-000000000002'), 'Client B', 'cross-tenant mutation attempts left Agency B unchanged');
select is((select count(*) from public.projects where name='Member project'), 1::bigint, 'revocation retained the project without exposing it');
select * from finish();
rollback;
