create table app_private.scan_worker_leases (
  workspace_id uuid not null,
  scan_id uuid not null,
  attempt_id uuid not null,
  worker_id uuid not null,
  lease_token uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, scan_id),
  unique (workspace_id, attempt_id),
  unique (workspace_id, lease_token),
  foreign key (workspace_id, scan_id, attempt_id)
    references public.scan_attempts (workspace_id, scan_id, id)
    on delete cascade,
  check (lease_expires_at > heartbeat_at),
  check (heartbeat_at >= claimed_at)
);
create index scan_worker_leases_expires_at_idx
  on app_private.scan_worker_leases (lease_expires_at, scan_id);

alter table app_private.scan_worker_leases enable row level security;
revoke all on app_private.scan_worker_leases from public, anon, authenticated, service_role;
create policy scan_worker_leases_deny_clients
  on app_private.scan_worker_leases
  for all to anon, authenticated using (false) with check (false);

create trigger scan_worker_leases_touch_updated_at
before update on app_private.scan_worker_leases
for each row execute function app_private.touch_updated_at();

create function app_private.claim_scan_work(
  p_worker_id uuid,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  expired_lease app_private.scan_worker_leases%rowtype;
  expired_scan public.scans%rowtype;
  expired_attempt public.scan_attempts%rowtype;
  expired_reservation app_private.scan_cost_reservations%rowtype;
  candidate_scan public.scans%rowtype;
  reservation app_private.scan_cost_reservations%rowtype;
  workspace_control app_private.workspace_scan_controls%rowtype;
  project_control app_private.project_scan_controls%rowtype;
  provider_config app_private.scan_provider_configs%rowtype;
  new_attempt_id uuid := gen_random_uuid();
  new_lease_token uuid := gen_random_uuid();
  next_attempt_number integer;
  new_lease_expires_at timestamptz;
  inserted_query_count integer;
  claim_queries jsonb;
begin
  if p_worker_id is null
     or p_lease_seconds is null
     or p_lease_seconds < 15
     or p_lease_seconds > 300 then
    raise exception 'Invalid scan worker claim' using errcode = '22023';
  end if;

  -- Recover at most one expired lease per claim call. The scan row lock makes
  -- retry creation serial for a scan, while SKIP LOCKED lets other workers
  -- continue claiming unrelated scans.
  select lease.*
  into expired_lease
  from app_private.scan_worker_leases lease
  where lease.lease_expires_at <= now_at
  order by lease.lease_expires_at, lease.scan_id
  for update skip locked
  limit 1;

  if found then
    select *
    into expired_scan
    from public.scans scan
    where scan.workspace_id = expired_lease.workspace_id
      and scan.id = expired_lease.scan_id
    for update;
    if not found then
      raise exception 'Scan lease invariant violated' using errcode = 'P0001';
    end if;

    select *
    into expired_attempt
    from public.scan_attempts attempt
    where attempt.workspace_id = expired_lease.workspace_id
      and attempt.scan_id = expired_lease.scan_id
      and attempt.id = expired_lease.attempt_id
    for update;
    if not found then
      raise exception 'Scan lease invariant violated' using errcode = 'P0001';
    end if;

    select *
    into expired_reservation
    from app_private.scan_cost_reservations existing
    where existing.workspace_id = expired_lease.workspace_id
      and existing.scan_id = expired_lease.scan_id
    for update;
    if not found then
      raise exception 'Scan reservation missing' using errcode = 'P0001';
    end if;

    if expired_scan.state <> 'running' or expired_attempt.state <> 'running' then
      raise exception 'Scan lease invariant violated' using errcode = 'P0001';
    end if;

    update public.scan_attempt_queries
    set state = 'failed', boundary_failure_code = null
    where workspace_id = expired_lease.workspace_id
      and scan_id = expired_lease.scan_id
      and attempt_id = expired_lease.attempt_id
      and state in ('unattempted', 'running');

    update public.scan_attempts
    set state = 'failed', finished_at = now_at
    where workspace_id = expired_lease.workspace_id
      and scan_id = expired_lease.scan_id
      and id = expired_lease.attempt_id;

    delete from app_private.scan_worker_leases
    where workspace_id = expired_lease.workspace_id
      and scan_id = expired_lease.scan_id;

    if expired_reservation.status = 'reserved'
       and expired_attempt.attempt_number < expired_reservation.max_attempts then
      update public.scans
      set state = 'queued'
      where workspace_id = expired_lease.workspace_id
        and id = expired_lease.scan_id;
    else
      update public.scans
      set state = 'failed'
      where workspace_id = expired_lease.workspace_id
        and id = expired_lease.scan_id;
    end if;
  end if;

  select scan.*
  into candidate_scan
  from public.scans scan
  join app_private.scan_cost_reservations existing
    on existing.workspace_id = scan.workspace_id
   and existing.scan_id = scan.id
  join app_private.workspace_scan_controls workspace_limit
    on workspace_limit.workspace_id = scan.workspace_id
  join app_private.project_scan_controls project_limit
    on project_limit.workspace_id = scan.workspace_id
   and project_limit.project_id = scan.project_id
  join app_private.scan_provider_configs provider_limit
    on provider_limit.provider = existing.provider
   and provider_limit.model_id = existing.model_id
   and provider_limit.price_version = existing.price_version
  where scan.state = 'queued'
    and existing.status = 'reserved'
    and workspace_limit.enabled
    and project_limit.enabled
    and provider_limit.enabled
    and (
      select count(*)
      from public.scan_attempts attempt
      where attempt.workspace_id = scan.workspace_id
        and attempt.scan_id = scan.id
    ) < existing.max_attempts
  order by scan.created_at, scan.id
  for update of scan skip locked
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into reservation
  from app_private.scan_cost_reservations existing
  where existing.workspace_id = candidate_scan.workspace_id
    and existing.scan_id = candidate_scan.id
  for update;
  if not found or reservation.status <> 'reserved' then
    return null;
  end if;

  select *
  into workspace_control
  from app_private.workspace_scan_controls control
  where control.workspace_id = candidate_scan.workspace_id
  for share;
  if not found or not workspace_control.enabled then
    return null;
  end if;

  select *
  into project_control
  from app_private.project_scan_controls control
  where control.workspace_id = candidate_scan.workspace_id
    and control.project_id = candidate_scan.project_id
  for share;
  if not found or not project_control.enabled then
    return null;
  end if;

  select *
  into provider_config
  from app_private.scan_provider_configs config
  where config.provider = reservation.provider
    and config.model_id = reservation.model_id
    and config.price_version = reservation.price_version
  for share;
  if not found or not provider_config.enabled then
    return null;
  end if;

  select coalesce(max(attempt.attempt_number), 0) + 1
  into next_attempt_number
  from public.scan_attempts attempt
  where attempt.workspace_id = candidate_scan.workspace_id
    and attempt.scan_id = candidate_scan.id;

  if next_attempt_number > reservation.max_attempts then
    raise exception 'Scan attempt limit exhausted' using errcode = 'P0001';
  end if;

  insert into public.scan_attempts (
    id,
    workspace_id,
    scan_id,
    attempt_number,
    state,
    started_at
  ) values (
    new_attempt_id,
    candidate_scan.workspace_id,
    candidate_scan.id,
    next_attempt_number,
    'running',
    now_at
  );

  insert into public.scan_attempt_queries (
    workspace_id,
    scan_id,
    attempt_id,
    query_ordinal,
    observation_id,
    state
  )
  select
    query.workspace_id,
    query.scan_id,
    new_attempt_id,
    query.query_ordinal,
    gen_random_uuid(),
    'unattempted'
  from public.scan_queries query
  where query.workspace_id = candidate_scan.workspace_id
    and query.scan_id = candidate_scan.id
  order by query.query_ordinal;
  get diagnostics inserted_query_count = row_count;

  if inserted_query_count <> candidate_scan.query_count then
    raise exception 'Scan query snapshot incomplete' using errcode = 'P0001';
  end if;

  update public.scans
  set state = 'running'
  where workspace_id = candidate_scan.workspace_id
    and id = candidate_scan.id;

  new_lease_expires_at := now_at + make_interval(secs => p_lease_seconds);
  insert into app_private.scan_worker_leases (
    workspace_id,
    scan_id,
    attempt_id,
    worker_id,
    lease_token,
    claimed_at,
    heartbeat_at,
    lease_expires_at
  ) values (
    candidate_scan.workspace_id,
    candidate_scan.id,
    new_attempt_id,
    p_worker_id,
    new_lease_token,
    now_at,
    now_at,
    new_lease_expires_at
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'queryOrdinal', query.query_ordinal,
        'queryId', query.query_id,
        'queryVersion', query.query_version,
        'queryText', query.query_text,
        'observationId', attempt_query.observation_id
      ) order by query.query_ordinal
    ),
    '[]'::jsonb
  )
  into claim_queries
  from public.scan_queries query
  join public.scan_attempt_queries attempt_query
    on attempt_query.workspace_id = query.workspace_id
   and attempt_query.scan_id = query.scan_id
   and attempt_query.query_ordinal = query.query_ordinal
   and attempt_query.attempt_id = new_attempt_id
  where query.workspace_id = candidate_scan.workspace_id
    and query.scan_id = candidate_scan.id;

  return jsonb_build_object(
    'workspaceId', candidate_scan.workspace_id,
    'scanId', candidate_scan.id,
    'projectId', candidate_scan.project_id,
    'reservationId', reservation.id,
    'attemptId', new_attempt_id,
    'attemptNumber', next_attempt_number,
    'workerId', p_worker_id,
    'leaseToken', new_lease_token,
    'leaseExpiresAt', new_lease_expires_at,
    'provider', reservation.provider,
    'modelId', reservation.model_id,
    'priceVersion', reservation.price_version,
    'currency', reservation.currency,
    'reservedMicrounits', reservation.reserved_microunits::text,
    'maxAttempts', reservation.max_attempts,
    'maxOutputTokens', reservation.max_output_tokens,
    'queries', claim_queries
  );
end;
$$;
revoke all on function app_private.claim_scan_work(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function app_private.claim_scan_work(uuid, integer)
  to service_role;

create function public.claim_scan_work(
  p_worker_id uuid,
  p_lease_seconds integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.claim_scan_work(p_worker_id, p_lease_seconds);
$$;
revoke all on function public.claim_scan_work(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_scan_work(uuid, integer)
  to service_role;

create function app_private.renew_scan_work_lease(
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

  perform 1
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

create function public.renew_scan_work_lease(
  p_workspace_id uuid,
  p_scan_id uuid,
  p_attempt_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.renew_scan_work_lease(
    p_workspace_id,
    p_scan_id,
    p_attempt_id,
    p_worker_id,
    p_lease_token,
    p_lease_seconds
  );
$$;
revoke all on function public.renew_scan_work_lease(uuid, uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.renew_scan_work_lease(uuid, uuid, uuid, uuid, uuid, integer)
  to service_role;

create function app_private.retry_scan_work(
  p_workspace_id uuid,
  p_scan_id uuid,
  p_attempt_id uuid,
  p_worker_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  lease app_private.scan_worker_leases%rowtype;
  attempt public.scan_attempts%rowtype;
  reservation app_private.scan_cost_reservations%rowtype;
  next_state text;
  retry_scheduled boolean;
begin
  if p_workspace_id is null
     or p_scan_id is null
     or p_attempt_id is null
     or p_worker_id is null
     or p_lease_token is null then
    raise exception 'Invalid scan retry request' using errcode = '22023';
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

  perform 1
  from public.scans scan
  where scan.workspace_id = p_workspace_id
    and scan.id = p_scan_id
    and scan.state = 'running'
  for update;
  if not found then
    raise exception 'Scan lease invariant violated' using errcode = 'P0001';
  end if;

  select *
  into attempt
  from public.scan_attempts existing
  where existing.workspace_id = p_workspace_id
    and existing.scan_id = p_scan_id
    and existing.id = p_attempt_id
  for update;
  if not found or attempt.state <> 'running' then
    raise exception 'Scan lease invariant violated' using errcode = 'P0001';
  end if;

  select *
  into reservation
  from app_private.scan_cost_reservations existing
  where existing.workspace_id = p_workspace_id
    and existing.scan_id = p_scan_id
  for update;
  if not found then
    raise exception 'Scan reservation missing' using errcode = 'P0001';
  end if;

  update public.scan_attempt_queries
  set state = 'failed', boundary_failure_code = null
  where workspace_id = p_workspace_id
    and scan_id = p_scan_id
    and attempt_id = p_attempt_id
    and state in ('unattempted', 'running');

  update public.scan_attempts
  set state = 'failed', finished_at = now_at
  where workspace_id = p_workspace_id
    and scan_id = p_scan_id
    and id = p_attempt_id;

  delete from app_private.scan_worker_leases
  where workspace_id = p_workspace_id
    and scan_id = p_scan_id;

  retry_scheduled := reservation.status = 'reserved'
    and attempt.attempt_number < reservation.max_attempts;
  next_state := case when retry_scheduled then 'queued' else 'failed' end;

  update public.scans
  set state = next_state
  where workspace_id = p_workspace_id
    and id = p_scan_id;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'scanId', p_scan_id,
    'attemptId', p_attempt_id,
    'attemptNumber', attempt.attempt_number,
    'maxAttempts', reservation.max_attempts,
    'nextState', next_state,
    'retryScheduled', retry_scheduled
  );
end;
$$;
revoke all on function app_private.retry_scan_work(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.retry_scan_work(uuid, uuid, uuid, uuid, uuid)
  to service_role;

create function public.retry_scan_work(
  p_workspace_id uuid,
  p_scan_id uuid,
  p_attempt_id uuid,
  p_worker_id uuid,
  p_lease_token uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.retry_scan_work(
    p_workspace_id,
    p_scan_id,
    p_attempt_id,
    p_worker_id,
    p_lease_token
  );
$$;
revoke all on function public.retry_scan_work(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.retry_scan_work(uuid, uuid, uuid, uuid, uuid)
  to service_role;