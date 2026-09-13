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

  perform 1
  from app_private.scan_provider_metering_configs config
  where config.provider = reservation.provider
    and config.model_id = reservation.model_id
    and config.price_version = reservation.price_version
  for share;
  if not found then
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

create function app_private.settle_terminal_scan_lease_before_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  scan_state text;
  attempt_state text;
  attempt_number integer;
  reservation app_private.scan_cost_reservations%rowtype;
  metering_available boolean;
  unobserved_query_count integer;
begin
  select scan.state
  into scan_state
  from public.scans scan
  where scan.workspace_id = old.workspace_id
    and scan.id = old.scan_id;

  select attempt.state, attempt.attempt_number
  into attempt_state, attempt_number
  from public.scan_attempts attempt
  where attempt.workspace_id = old.workspace_id
    and attempt.scan_id = old.scan_id
    and attempt.id = old.attempt_id;

  select *
  into reservation
  from app_private.scan_cost_reservations existing
  where existing.workspace_id = old.workspace_id
    and existing.scan_id = old.scan_id;

  if scan_state = 'running'
     and attempt_state = 'failed'
     and reservation.status = 'reserved'
     and attempt_number >= reservation.max_attempts then
    select exists (
      select 1
      from app_private.scan_provider_metering_configs config
      where config.provider = reservation.provider
        and config.model_id = reservation.model_id
        and config.price_version = reservation.price_version
    )
    into metering_available;

    if metering_available then
      perform app_private.settle_scan_metering(
        old.workspace_id,
        old.scan_id,
        old.attempt_id,
        old.worker_id,
        old.lease_token
      );
    else
      -- A reservation created before C7b can lack a parsed metering-rate row.
      -- Never strand that reservation or guess zero: charge its entire immutable
      -- worst-case reservation and record the result as unobserved exposure.
      select count(*)::integer
      into unobserved_query_count
      from public.scan_attempt_queries attempt_query
      where attempt_query.workspace_id = old.workspace_id
        and attempt_query.scan_id = old.scan_id;

      if unobserved_query_count > 100 then
        raise exception 'Too many unobserved scan queries' using errcode = '22023';
      end if;

      update app_private.scan_cost_reservations
      set status = 'settled',
          settlement_key = old.lease_token,
          settled_microunits = reservation.reserved_microunits
      where id = reservation.id
      returning * into reservation;

      insert into public.scan_metering_summaries (
        workspace_id,
        scan_id,
        reservation_id,
        attempt_id,
        worker_id,
        settlement_key,
        provider,
        model_id,
        price_version,
        currency,
        cost_basis,
        observed_usage_count,
        unobserved_query_count,
        observed_cost_microunits,
        unobserved_cost_microunits,
        settled_microunits
      ) values (
        old.workspace_id,
        old.scan_id,
        reservation.id,
        old.attempt_id,
        old.worker_id,
        old.lease_token,
        reservation.provider,
        reservation.model_id,
        reservation.price_version,
        reservation.currency,
        'gross_list_price',
        0,
        unobserved_query_count,
        0,
        reservation.reserved_microunits,
        reservation.reserved_microunits
      );
    end if;
  end if;

  return old;
end;
$$;
revoke all on function app_private.settle_terminal_scan_lease_before_delete()
  from public, anon, authenticated, service_role;

create trigger scan_worker_leases_settle_terminal_before_delete
before delete on app_private.scan_worker_leases
for each row execute function app_private.settle_terminal_scan_lease_before_delete();
