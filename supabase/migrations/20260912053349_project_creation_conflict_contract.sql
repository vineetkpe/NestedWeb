create or replace function app_private.create_project(
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
  violated_constraint text;
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

  begin
    insert into public.projects (workspace_id, name, tracked_domain, created_by)
    values (p_workspace_id, p_project_name, p_tracked_domain, actor_id)
    returning id into new_project_id;
  exception
    when unique_violation then
      get stacked diagnostics violated_constraint = constraint_name;
      if violated_constraint = 'projects_workspace_tracked_domain_key' then
        raise exception 'Tracked domain already exists in workspace'
          using errcode = '22023';
      end if;
      raise;
  end;

  update app_private.project_creation_requests
  set project_id = new_project_id
  where user_id = actor_id and idempotency_key = p_idempotency_key;

  return new_project_id;
end;
$$;
