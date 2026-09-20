create function app_private.claim_scan_work_for_scan(
  p_workspace_id uuid,
  p_project_id uuid,
  p_scan_id uuid,
  p_reservation_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed jsonb;
begin
  if p_workspace_id is null
     or p_project_id is null
     or p_scan_id is null
     or p_reservation_id is null
     or p_worker_id is null
     or p_lease_seconds is null
     or p_lease_seconds < 15
     or p_lease_seconds > 300 then
    raise exception 'Invalid targeted scan worker claim' using errcode = '22023';
  end if;

  begin
    claimed := app_private.claim_scan_work(p_worker_id, p_lease_seconds);

    if claimed is null then
      return null;
    end if;

    if (claimed ->> 'workspaceId')::uuid <> p_workspace_id
       or (claimed ->> 'projectId')::uuid <> p_project_id
       or (claimed ->> 'scanId')::uuid <> p_scan_id
       or (claimed ->> 'reservationId')::uuid <> p_reservation_id then
      raise exception 'Requested scan is not next claimable work' using errcode = 'NW001';
    end if;

    return claimed;
  exception
    when sqlstate 'NW001' then
      return null;
  end;
end;
$$;
revoke all on function app_private.claim_scan_work_for_scan(uuid, uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function app_private.claim_scan_work_for_scan(uuid, uuid, uuid, uuid, uuid, integer)
  to service_role;

create function public.claim_scan_work_for_scan(
  p_workspace_id uuid,
  p_project_id uuid,
  p_scan_id uuid,
  p_reservation_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.claim_scan_work_for_scan(
    p_workspace_id,
    p_project_id,
    p_scan_id,
    p_reservation_id,
    p_worker_id,
    p_lease_seconds
  );
$$;
revoke all on function public.claim_scan_work_for_scan(uuid, uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_scan_work_for_scan(uuid, uuid, uuid, uuid, uuid, integer)
  to service_role;
