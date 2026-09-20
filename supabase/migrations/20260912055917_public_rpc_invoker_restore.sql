-- Restore the reviewed public SECURITY INVOKER pattern. `app_private` is not
-- exposed by the Supabase Data API (`supabase/config.toml` exposes only
-- `public` and `graphql_public`). The grants below are required for the invoker
-- wrappers to reach the hardened private SECURITY DEFINER implementations.

create or replace function public.create_workspace(
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

grant usage on schema app_private to authenticated;
grant execute on function app_private.create_workspace(text, uuid)
  to authenticated;
grant execute on function app_private.create_project(uuid, text, text, uuid)
  to authenticated;
