-- Security-exit experiment: make the exposed wrappers the only client-callable
-- entrypoints. This is immediately compensated by the following migration
-- because Supabase's security advisor correctly flags exposed SECURITY DEFINER
-- functions. Keep both migrations to match the applied hosted history.

create or replace function public.create_workspace(
  p_workspace_name text,
  p_idempotency_key uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app_private.create_workspace(p_workspace_name, p_idempotency_key);
$$;
revoke all on function public.create_workspace(text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_workspace(text, uuid)
  to authenticated;

create or replace function public.create_project(
  p_workspace_id uuid,
  p_project_name text,
  p_tracked_domain text,
  p_idempotency_key uuid
)
returns uuid
language sql
security definer
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

revoke usage on schema app_private from authenticated;
revoke execute on function app_private.create_workspace(text, uuid)
  from authenticated;
revoke execute on function app_private.create_project(uuid, text, text, uuid)
  from authenticated;
