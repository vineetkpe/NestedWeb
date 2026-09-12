create table app_private.workspace_bootstrap_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  workspace_name text not null check (
    workspace_name = btrim(workspace_name)
    and char_length(workspace_name) between 1 and 120
  ),
  workspace_id uuid unique references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);
alter table app_private.workspace_bootstrap_requests enable row level security;
revoke all on app_private.workspace_bootstrap_requests from public, anon, authenticated;

drop function public.create_workspace(text);
drop function app_private.create_workspace(text);

create function app_private.create_workspace(
  p_workspace_name text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  stored_workspace_name text;
  existing_workspace_id uuid;
  new_workspace_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;

  insert into app_private.workspace_bootstrap_requests (
    user_id,
    idempotency_key,
    workspace_name
  )
  values (actor_id, p_idempotency_key, p_workspace_name)
  on conflict (user_id, idempotency_key) do nothing;

  select request.workspace_name, request.workspace_id
    into stored_workspace_name, existing_workspace_id
  from app_private.workspace_bootstrap_requests request
  where request.user_id = actor_id
    and request.idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception 'Workspace bootstrap request missing' using errcode = 'P0001';
  end if;
  if stored_workspace_name is distinct from p_workspace_name then
    raise exception 'Idempotency key reused with different workspace name'
      using errcode = '22023';
  end if;
  if existing_workspace_id is not null then
    return existing_workspace_id;
  end if;

  insert into public.workspaces (name, created_by)
  values (p_workspace_name, actor_id)
  returning id into new_workspace_id;

  insert into public.workspace_memberships (workspace_id, user_id, role)
  values (new_workspace_id, actor_id, 'owner');

  update app_private.workspace_bootstrap_requests
  set workspace_id = new_workspace_id
  where user_id = actor_id and idempotency_key = p_idempotency_key;

  return new_workspace_id;
end;
$$;
revoke all on function app_private.create_workspace(text, uuid) from public, anon, authenticated;
grant execute on function app_private.create_workspace(text, uuid) to authenticated;

create function public.create_workspace(
  p_workspace_name text,
  p_idempotency_key uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app_private.create_workspace(p_workspace_name, p_idempotency_key);
$$;
revoke all on function public.create_workspace(text, uuid) from public, anon, authenticated;
grant execute on function public.create_workspace(text, uuid) to authenticated;
