-- Local draft: inspect hosted schema/history and pass isolation tests before applying.
-- Supabase Auth owns identities; no passwords or duplicated email records here.
create schema app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create table public.profiles (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text check (display_name is null or (
    display_name = btrim(display_name) and char_length(display_name) between 1 and 120
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_created_by_idx on public.workspaces (created_by);

create table public.workspace_memberships (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_memberships_user_id_idx
  on public.workspace_memberships (user_id, workspace_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  tracked_domain text not null check (
    char_length(tracked_domain) <= 253
    and tracked_domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  ),
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index projects_workspace_created_at_idx on public.projects (workspace_id, created_at);
create index projects_created_by_idx on public.projects (created_by);

create function app_private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function app_private.touch_updated_at() from public, anon, authenticated;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function app_private.touch_updated_at();
create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function app_private.touch_updated_at();
create trigger workspace_memberships_updated_at before update on public.workspace_memberships
  for each row execute function app_private.touch_updated_at();
create trigger projects_updated_at before update on public.projects
  for each row execute function app_private.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.projects enable row level security;

-- Do not rely on project-specific default grants in the exposed public schema.
revoke all on public.profiles, public.workspaces, public.workspace_memberships, public.projects
  from public, anon, authenticated;
grant select on public.profiles, public.workspaces, public.workspace_memberships, public.projects
  to authenticated;
grant insert (display_name), update (display_name) on public.profiles to authenticated;
grant update (name) on public.workspaces to authenticated;
grant insert (workspace_id, name, tracked_domain), update (name, tracked_domain)
  on public.projects to authenticated;
grant delete on public.projects to authenticated;

create policy profiles_select_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- This policy does not query memberships, so policies using it cannot recurse.
create policy memberships_select_self on public.workspace_memberships
  for select to authenticated using (user_id = (select auth.uid()));

create policy workspaces_select_member on public.workspaces
  for select to authenticated using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = workspaces.id and m.user_id = (select auth.uid())
  ));
create policy workspaces_update_owner on public.workspaces
  for update to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = workspaces.id and m.user_id = (select auth.uid()) and m.role = 'owner'
  ))
  with check (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = workspaces.id and m.user_id = (select auth.uid()) and m.role = 'owner'
  ));

create policy projects_select_member on public.projects
  for select to authenticated using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = projects.workspace_id and m.user_id = (select auth.uid())
  ));
create policy projects_insert_member on public.projects
  for insert to authenticated with check (
    created_by = (select auth.uid()) and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = projects.workspace_id and m.user_id = (select auth.uid())
    )
  );
create policy projects_update_member on public.projects
  for update to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = projects.workspace_id and m.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = projects.workspace_id and m.user_id = (select auth.uid())
  ));
create policy projects_delete_member on public.projects
  for delete to authenticated using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = projects.workspace_id and m.user_id = (select auth.uid())
  ));

-- Direct client inserts are denied. This function is the sole bootstrap path.
-- Both inserts succeed or roll back together in the calling transaction.
create function app_private.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  new_workspace_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.workspaces (name, created_by)
  values (workspace_name, actor_id)
  returning id into new_workspace_id;

  insert into public.workspace_memberships (workspace_id, user_id, role)
  values (new_workspace_id, actor_id, 'owner');

  return new_workspace_id;
end;
$$;
revoke all on function app_private.create_workspace(text) from public, anon, authenticated;
grant execute on function app_private.create_workspace(text) to authenticated;

create function public.create_workspace(workspace_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app_private.create_workspace(workspace_name);
$$;
revoke all on function public.create_workspace(text) from public, anon, authenticated;
grant execute on function public.create_workspace(text) to authenticated;
