alter table public.projects
  add constraint projects_workspace_tracked_domain_key
  unique (workspace_id, tracked_domain);

revoke insert on public.projects from authenticated;

create table app_private.project_creation_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_name text not null check (
    project_name = btrim(project_name)
    and char_length(project_name) between 1 and 120
  ),
  tracked_domain text not null check (
    char_length(tracked_domain) <= 253
    and tracked_domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  ),
  project_id uuid unique references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);
alter table app_private.project_creation_requests enable row level security;
revoke all on app_private.project_creation_requests from public, anon, authenticated;
create policy project_creation_requests_deny_clients
  on app_private.project_creation_requests
  for all to anon, authenticated
  using (false)
  with check (false);

create function app_private.create_project(
  p_workspace_id uuid,
  p_project_name text,
  p_tracked_domain text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  locked_member_id uuid;
  stored_workspace_id uuid;
  stored_project_name text;
  stored_tracked_domain text;
  existing_project_id uuid;
  new_project_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;

  select membership.user_id
    into locked_member_id
  from public.workspace_memberships membership
  where membership.workspace_id = p_workspace_id
    and membership.user_id = actor_id
  for key share;

  if not found then
    raise exception 'Workspace membership required' using errcode = '42501';
  end if;

  insert into app_private.project_creation_requests (
    user_id,
    idempotency_key,
    workspace_id,
    project_name,
    tracked_domain
  )
  values (
    actor_id,
    p_idempotency_key,
    p_workspace_id,
    p_project_name,
    p_tracked_domain
  )
  on conflict (user_id, idempotency_key) do nothing;

  select request.workspace_id,
         request.project_name,
         request.tracked_domain,
         request.project_id
    into stored_workspace_id,
         stored_project_name,
         stored_tracked_domain,
         existing_project_id
  from app_private.project_creation_requests request
  where request.user_id = actor_id
    and request.idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception 'Project creation request missing' using errcode = 'P0001';
  end if;
  if stored_workspace_id is distinct from p_workspace_id
     or stored_project_name is distinct from p_project_name
     or stored_tracked_domain is distinct from p_tracked_domain then
    raise exception 'Idempotency key reused with different project payload'
      using errcode = '22023';
  end if;
  if existing_project_id is not null then
    return existing_project_id;
  end if;

  insert into public.projects (workspace_id, name, tracked_domain, created_by)
  values (p_workspace_id, p_project_name, p_tracked_domain, actor_id)
  returning id into new_project_id;

  update app_private.project_creation_requests
  set project_id = new_project_id
  where user_id = actor_id and idempotency_key = p_idempotency_key;

  return new_project_id;
end;
$$;
revoke all on function app_private.create_project(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function app_private.create_project(uuid, text, text, uuid)
  to authenticated;

create function public.create_project(
  p_workspace_id uuid,
  p_project_name text,
  p_tracked_domain text,
  p_idempotency_key uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app_private.create_project(
    p_workspace_id,
    p_project_name,
    p_tracked_domain,
    p_idempotency_key
  );
$$;
revoke all on function public.create_project(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_project(uuid, text, text, uuid)
  to authenticated;
