create or replace function app_private.renew_scan_work_lease(
  p_workspace_id uuid,
  p_scan_id uuid,
  p_attempt_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  lease app_private.scan_worker_leases%rowtype;
  scan_row public.scans%rowtype;
  reservation app_private.scan_cost_reservations%rowtype;
  workspace_control app_private.workspace_scan_controls%rowtype;
  project_control app_private.project_scan_controls%rowtype;
  provider_config app_private.scan_provider_configs%rowtype;
  next_expiry timestamptz;
begin
  if p_workspace_id is null
     or p_scan_id is null
     or p_attempt_id is null
     or p_worker_id is null
     or p_lease_token is null
     or p_lease_seconds is null
     or p_lease_seconds < 15
     or p_lease_seconds > 300 then
    raise exception 'Invalid scan lease renewal' using errcode = '22023';
  end if;

  select *
  into lease
  from app_private.scan_worker_leases existing
  where existing.workspace_id = p_workspace_id
    and existing.scan_id = p_scan_id
    and existing.attempt_id = p_attempt_id
    and existing.worker_id = p_worker_id
    and existing.lease_token = p_lease_token
  for update;
  if not found then
    raise exception 'Scan lease not found' using errcode = 'P0001';
  end if;
  if lease.lease_expires_at <= now_at then
    raise exception 'Scan lease expired' using errcode = 'P0001';
  end if;

  select *
  into scan_row
  from public.scans scan
  where scan.workspace_id = p_workspace_id
    and scan.id = p_scan_id
    and scan.state = 'running'
  for update;
  if not found then
    raise exception 'Scan lease invariant violated' using errcode = 'P0001';
  end if;

  perform 1
  from public.scan_attempts attempt
  where attempt.workspace_id = p_workspace_id
    and attempt.scan_id = p_scan_id
    and attempt.id = p_attempt_id
    and attempt.state = 'running'
  for update;
  if not found then
    raise exception 'Scan lease invariant violated' using errcode = 'P0001';
  end if;

  select *
  into reservation
  from app_private.scan_cost_reservations existing
  where existing.workspace_id = p_workspace_id
    and existing.scan_id = p_scan_id
  for share;
  if not found
     or reservation.status <> 'reserved'
     or reservation.project_id <> scan_row.project_id then
    raise exception 'Scan execution disabled' using errcode = 'P0001';
  end if;

  select *
  into workspace_control
  from app_private.workspace_scan_controls control
  where control.workspace_id = p_workspace_id
  for share;
  if not found
     or not workspace_control.enabled
     or workspace_control.provider <> reservation.provider
     or workspace_control.model_id <> reservation.model_id
     or workspace_control.price_version <> reservation.price_version then
    raise exception 'Scan execution disabled' using errcode = 'P0001';
  end if;

  select *
  into project_control
  from app_private.project_scan_controls control
  where control.workspace_id = p_workspace_id
    and control.project_id = reservation.project_id
  for share;
  if not found or not project_control.enabled then
    raise exception 'Scan execution disabled' using errcode = 'P0001';
  end if;

  select *
  into provider_config
  from app_private.scan_provider_configs config
  where config.provider = reservation.provider
    and config.model_id = reservation.model_id
    and config.price_version = reservation.price_version
  for share;
  if not found or not provider_config.enabled then
    raise exception 'Scan execution disabled' using errcode = 'P0001';
  end if;

  next_expiry := now_at + make_interval(secs => p_lease_seconds);
  update app_private.scan_worker_leases
  set heartbeat_at = now_at,
      lease_expires_at = next_expiry
  where workspace_id = p_workspace_id
    and scan_id = p_scan_id;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'scanId', p_scan_id,
    'attemptId', p_attempt_id,
    'workerId', p_worker_id,
    'leaseToken', p_lease_token,
    'leaseExpiresAt', next_expiry
  );
end;
$$;

revoke all on function app_private.renew_scan_work_lease(uuid, uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function app_private.renew_scan_work_lease(uuid, uuid, uuid, uuid, uuid, integer)
  to service_role;
