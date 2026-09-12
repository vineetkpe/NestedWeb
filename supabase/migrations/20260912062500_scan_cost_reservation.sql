create table app_private.scan_provider_configs (
  provider text not null check (provider = 'gemini'),
  model_id text not null check (
    model_id = btrim(model_id)
    and char_length(model_id) between 1 and 120
  ),
  price_version text not null check (
    price_version = btrim(price_version)
    and char_length(price_version) between 1 and 120
  ),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  worst_case_cost_per_query_microunits bigint not null check (
    worst_case_cost_per_query_microunits > 0
  ),
  max_output_tokens integer not null check (max_output_tokens > 0),
  max_global_active_scans integer not null check (max_global_active_scans > 0),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, model_id, price_version)
);

create table app_private.workspace_scan_controls (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  provider text not null,
  model_id text not null,
  price_version text not null,
  enabled boolean not null default false,
  max_queries_per_scan smallint not null check (max_queries_per_scan between 1 and 10),
  max_attempts_per_scan smallint not null check (max_attempts_per_scan between 1 and 10),
  max_concurrent_scans integer not null check (max_concurrent_scans > 0),
  max_scans_per_window integer not null check (max_scans_per_window > 0),
  budget_window_start timestamptz not null,
  budget_window_end timestamptz not null,
  budget_microunits bigint not null check (budget_microunits > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (provider, model_id, price_version)
    references app_private.scan_provider_configs (provider, model_id, price_version)
    on delete restrict,
  check (budget_window_end > budget_window_start)
);

create table app_private.project_scan_controls (
  workspace_id uuid not null,
  project_id uuid not null,
  enabled boolean not null default false,
  max_queries_per_scan smallint not null check (max_queries_per_scan between 1 and 10),
  max_attempts_per_scan smallint not null check (max_attempts_per_scan between 1 and 10),
  max_concurrent_scans integer not null check (max_concurrent_scans > 0),
  max_scans_per_window integer not null check (max_scans_per_window > 0),
  budget_window_start timestamptz not null,
  budget_window_end timestamptz not null,
  budget_microunits bigint not null check (budget_microunits > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, project_id),
  foreign key (workspace_id, project_id)
    references public.projects (workspace_id, id)
    on delete cascade,
  check (budget_window_end > budget_window_start)
);

create table app_private.scan_cost_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  scan_id uuid not null,
  provider text not null,
  model_id text not null,
  price_version text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  worst_case_cost_per_query_microunits bigint not null check (
    worst_case_cost_per_query_microunits > 0
  ),
  max_output_tokens integer not null check (max_output_tokens > 0),
  query_count smallint not null check (query_count between 1 and 10),
  max_attempts smallint not null check (max_attempts between 1 and 10),
  reserved_microunits bigint not null check (reserved_microunits > 0),
  status text not null default 'reserved' check (
    status in ('reserved', 'settled', 'released')
  ),
  settlement_key uuid,
  settled_microunits bigint check (
    settled_microunits is null
    or (settled_microunits >= 0 and settled_microunits <= reserved_microunits)
  ),
  workspace_budget_window_start timestamptz not null,
  workspace_budget_window_end timestamptz not null,
  project_budget_window_start timestamptz not null,
  project_budget_window_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, scan_id),
  unique (workspace_id, settlement_key),
  foreign key (workspace_id, project_id)
    references public.projects (workspace_id, id)
    on delete restrict,
  foreign key (workspace_id, scan_id)
    references public.scans (workspace_id, id)
    on delete cascade,
  foreign key (provider, model_id, price_version)
    references app_private.scan_provider_configs (provider, model_id, price_version)
    on delete restrict,
  check (workspace_budget_window_end > workspace_budget_window_start),
  check (project_budget_window_end > project_budget_window_start),
  check (
    (status = 'reserved' and settlement_key is null and settled_microunits is null)
    or (
      status = 'settled'
      and settlement_key is not null
      and settled_microunits is not null
      and settled_microunits > 0
    )
    or (
      status = 'released'
      and settlement_key is not null
      and settled_microunits = 0
    )
  )
);
create index scan_cost_reservations_workspace_created_at_idx
  on app_private.scan_cost_reservations (workspace_id, created_at);
create index scan_cost_reservations_project_created_at_idx
  on app_private.scan_cost_reservations (workspace_id, project_id, created_at);
create index scan_cost_reservations_provider_idx
  on app_private.scan_cost_reservations (provider, model_id, created_at);

alter table app_private.scan_provider_configs enable row level security;
alter table app_private.workspace_scan_controls enable row level security;
alter table app_private.project_scan_controls enable row level security;
alter table app_private.scan_cost_reservations enable row level security;

revoke all on app_private.scan_provider_configs,
  app_private.workspace_scan_controls,
  app_private.project_scan_controls,
  app_private.scan_cost_reservations
from public, anon, authenticated;

create policy scan_provider_configs_deny_clients
  on app_private.scan_provider_configs
  for all to anon, authenticated using (false) with check (false);
create policy workspace_scan_controls_deny_clients
  on app_private.workspace_scan_controls
  for all to anon, authenticated using (false) with check (false);
create policy project_scan_controls_deny_clients
  on app_private.project_scan_controls
  for all to anon, authenticated using (false) with check (false);
create policy scan_cost_reservations_deny_clients
  on app_private.scan_cost_reservations
  for all to anon, authenticated using (false) with check (false);

create trigger scan_provider_configs_touch_updated_at
before update on app_private.scan_provider_configs
for each row execute function app_private.touch_updated_at();
create trigger workspace_scan_controls_touch_updated_at
before update on app_private.workspace_scan_controls
for each row execute function app_private.touch_updated_at();
create trigger project_scan_controls_touch_updated_at
before update on app_private.project_scan_controls
for each row execute function app_private.touch_updated_at();
create trigger scan_cost_reservations_touch_updated_at
before update on app_private.scan_cost_reservations
for each row execute function app_private.touch_updated_at();

create function app_private.reserve_scan(
  p_workspace_id uuid,
  p_project_id uuid,
  p_idempotency_key uuid,
  p_prompt_method_version text,
  p_profile_method_version text,
  p_queries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  request_fingerprint text;
  query_count integer;
  unique_query_count integer;
  now_at timestamptz := clock_timestamp();
  existing_scan public.scans%rowtype;
  existing_reservation app_private.scan_cost_reservations%rowtype;
  workspace_control app_private.workspace_scan_controls%rowtype;
  project_control app_private.project_scan_controls%rowtype;
  provider_config app_private.scan_provider_configs%rowtype;
  effective_max_queries integer;
  effective_max_attempts integer;
  workspace_active integer;
  project_active integer;
  provider_active integer;
  workspace_request_count integer;
  project_request_count integer;
  workspace_used numeric;
  project_used numeric;
  reserved_cost_numeric numeric;
  reserved_cost bigint;
  new_scan_id uuid := gen_random_uuid();
  new_reservation_id uuid := gen_random_uuid();
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_prompt_method_version <> 'niche-prompts-v1'
     or p_profile_method_version <> 'company-profile-v2' then
    raise exception 'Invalid scan request' using errcode = '22023';
  end if;

  if p_queries is null or jsonb_typeof(p_queries) <> 'array' then
    raise exception 'Invalid scan queries' using errcode = '22023';
  end if;

  query_count := jsonb_array_length(p_queries);
  if query_count < 1 or query_count > 10 then
    raise exception 'Invalid scan queries' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_queries) query
    where jsonb_typeof(query) <> 'object'
  ) then
    raise exception 'Invalid scan queries' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_queries) query
    where not (query ?& array['queryId', 'queryVersion', 'queryText'])
      or (select count(*) from jsonb_object_keys(query)) <> 3
      or query ->> 'queryId' is null
      or char_length(query ->> 'queryId') < 1
      or char_length(query ->> 'queryId') > 8192
      or position('niche-prompts-v1:' in query ->> 'queryId') <> 1
      or query ->> 'queryVersion' not in (
        'category@v1',
        'service-area@v1',
        'best-audience@v1',
        'alternatives@v1',
        'comparison-category@v1',
        'use-case@v1',
        'use-case-audience@v1',
        'buyer@v1'
      )
      or query ->> 'queryText' is null
      or char_length(query ->> 'queryText') < 1
      or char_length(query ->> 'queryText') > 600
      or btrim(query ->> 'queryText') = ''
      or query ->> 'queryText' ~ '[[:cntrl:]]'
  ) then
    raise exception 'Invalid scan queries' using errcode = '22023';
  end if;

  select count(distinct query ->> 'queryId')
  into unique_query_count
  from jsonb_array_elements(p_queries) query;
  if unique_query_count <> query_count then
    raise exception 'Invalid scan queries' using errcode = '22023';
  end if;

  request_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'projectId', p_project_id::text,
          'promptMethodVersion', p_prompt_method_version,
          'profileMethodVersion', p_profile_method_version,
          'queries', p_queries
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform 1
  from public.workspace_memberships membership
  where membership.workspace_id = p_workspace_id
    and membership.user_id = actor_id
  for key share;
  if not found then
    raise exception 'Workspace membership required' using errcode = '42501';
  end if;

  perform 1
  from public.projects project
  where project.workspace_id = p_workspace_id
    and project.id = p_project_id
  for key share;
  if not found then
    raise exception 'Project access required' using errcode = '42501';
  end if;

  select *
  into existing_scan
  from public.scans scan
  where scan.workspace_id = p_workspace_id
    and scan.idempotency_key = p_idempotency_key;

  if found then
    if existing_scan.project_id is distinct from p_project_id
       or existing_scan.request_fingerprint is distinct from request_fingerprint
       or existing_scan.prompt_method_version is distinct from p_prompt_method_version
       or existing_scan.profile_method_version is distinct from p_profile_method_version
       or existing_scan.query_count is distinct from query_count then
      raise exception 'Idempotency key reused with different scan request'
        using errcode = '22023';
    end if;

    select *
    into existing_reservation
    from app_private.scan_cost_reservations reservation
    where reservation.workspace_id = p_workspace_id
      and reservation.scan_id = existing_scan.id;
    if not found then
      raise exception 'Scan reservation missing' using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'scanId', existing_scan.id,
      'reservationId', existing_reservation.id,
      'reservedMicrounits', existing_reservation.reserved_microunits::text,
      'currency', existing_reservation.currency,
      'provider', existing_reservation.provider,
      'modelId', existing_reservation.model_id,
      'priceVersion', existing_reservation.price_version,
      'maxAttempts', existing_reservation.max_attempts,
      'maxOutputTokens', existing_reservation.max_output_tokens,
      'requestFingerprint', existing_scan.request_fingerprint,
      'replayed', true
    );
  end if;

  select *
  into workspace_control
  from app_private.workspace_scan_controls control
  where control.workspace_id = p_workspace_id
  for update;
  if not found or not workspace_control.enabled then
    raise exception 'Scan execution unavailable' using errcode = 'P0001';
  end if;
  if now_at < workspace_control.budget_window_start
     or now_at >= workspace_control.budget_window_end then
    raise exception 'Workspace budget window unavailable' using errcode = 'P0001';
  end if;

  select *
  into project_control
  from app_private.project_scan_controls control
  where control.workspace_id = p_workspace_id
    and control.project_id = p_project_id
  for update;
  if not found or not project_control.enabled then
    raise exception 'Scan execution unavailable' using errcode = 'P0001';
  end if;
  if now_at < project_control.budget_window_start
     or now_at >= project_control.budget_window_end then
    raise exception 'Project budget window unavailable' using errcode = 'P0001';
  end if;

  select *
  into provider_config
  from app_private.scan_provider_configs config
  where config.provider = workspace_control.provider
    and config.model_id = workspace_control.model_id
    and config.price_version = workspace_control.price_version
  for update;
  if not found or not provider_config.enabled then
    raise exception 'Provider pricing unavailable' using errcode = 'P0001';
  end if;

  -- Re-check after serializing reservation work for this workspace.
  select *
  into existing_scan
  from public.scans scan
  where scan.workspace_id = p_workspace_id
    and scan.idempotency_key = p_idempotency_key;
  if found then
    if existing_scan.project_id is distinct from p_project_id
       or existing_scan.request_fingerprint is distinct from request_fingerprint
       or existing_scan.prompt_method_version is distinct from p_prompt_method_version
       or existing_scan.profile_method_version is distinct from p_profile_method_version
       or existing_scan.query_count is distinct from query_count then
      raise exception 'Idempotency key reused with different scan request'
        using errcode = '22023';
    end if;
    select *
    into existing_reservation
    from app_private.scan_cost_reservations reservation
    where reservation.workspace_id = p_workspace_id
      and reservation.scan_id = existing_scan.id;
    if not found then
      raise exception 'Scan reservation missing' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'scanId', existing_scan.id,
      'reservationId', existing_reservation.id,
      'reservedMicrounits', existing_reservation.reserved_microunits::text,
      'currency', existing_reservation.currency,
      'provider', existing_reservation.provider,
      'modelId', existing_reservation.model_id,
      'priceVersion', existing_reservation.price_version,
      'maxAttempts', existing_reservation.max_attempts,
      'maxOutputTokens', existing_reservation.max_output_tokens,
      'requestFingerprint', existing_scan.request_fingerprint,
      'replayed', true
    );
  end if;

  effective_max_queries := least(
    workspace_control.max_queries_per_scan,
    project_control.max_queries_per_scan
  );
  if query_count > effective_max_queries then
    raise exception 'Scan query limit exceeded' using errcode = 'P0001';
  end if;

  effective_max_attempts := least(
    workspace_control.max_attempts_per_scan,
    project_control.max_attempts_per_scan
  );

  select count(*)
  into workspace_active
  from public.scans scan
  where scan.workspace_id = p_workspace_id
    and scan.state in ('queued', 'running');
  if workspace_active >= workspace_control.max_concurrent_scans then
    raise exception 'Workspace scan concurrency exhausted' using errcode = 'P0001';
  end if;

  select count(*)
  into project_active
  from public.scans scan
  where scan.workspace_id = p_workspace_id
    and scan.project_id = p_project_id
    and scan.state in ('queued', 'running');
  if project_active >= project_control.max_concurrent_scans then
    raise exception 'Project scan concurrency exhausted' using errcode = 'P0001';
  end if;

  select count(*)
  into provider_active
  from public.scans scan
  join app_private.scan_cost_reservations reservation
    on reservation.workspace_id = scan.workspace_id
   and reservation.scan_id = scan.id
  where reservation.provider = provider_config.provider
    and reservation.model_id = provider_config.model_id
    and scan.state in ('queued', 'running');
  if provider_active >= provider_config.max_global_active_scans then
    raise exception 'Provider scan concurrency exhausted' using errcode = 'P0001';
  end if;

  select count(*)
  into workspace_request_count
  from app_private.scan_cost_reservations reservation
  where reservation.workspace_id = p_workspace_id
    and reservation.created_at >= workspace_control.budget_window_start
    and reservation.created_at < workspace_control.budget_window_end;
  if workspace_request_count >= workspace_control.max_scans_per_window then
    raise exception 'Workspace scan request limit exhausted' using errcode = 'P0001';
  end if;

  select count(*)
  into project_request_count
  from app_private.scan_cost_reservations reservation
  where reservation.workspace_id = p_workspace_id
    and reservation.project_id = p_project_id
    and reservation.created_at >= project_control.budget_window_start
    and reservation.created_at < project_control.budget_window_end;
  if project_request_count >= project_control.max_scans_per_window then
    raise exception 'Project scan request limit exhausted' using errcode = 'P0001';
  end if;

  select coalesce(sum(
    case reservation.status
      when 'settled' then reservation.settled_microunits
      when 'released' then 0
      else reservation.reserved_microunits
    end
  ), 0)
  into workspace_used
  from app_private.scan_cost_reservations reservation
  where reservation.workspace_id = p_workspace_id
    and reservation.created_at >= workspace_control.budget_window_start
    and reservation.created_at < workspace_control.budget_window_end;

  select coalesce(sum(
    case reservation.status
      when 'settled' then reservation.settled_microunits
      when 'released' then 0
      else reservation.reserved_microunits
    end
  ), 0)
  into project_used
  from app_private.scan_cost_reservations reservation
  where reservation.workspace_id = p_workspace_id
    and reservation.project_id = p_project_id
    and reservation.created_at >= project_control.budget_window_start
    and reservation.created_at < project_control.budget_window_end;

  reserved_cost_numeric :=
    query_count::numeric
    * effective_max_attempts::numeric
    * provider_config.worst_case_cost_per_query_microunits::numeric;
  if reserved_cost_numeric <= 0 or reserved_cost_numeric > 9223372036854775807::numeric then
    raise exception 'Provider pricing unavailable' using errcode = 'P0001';
  end if;
  reserved_cost := reserved_cost_numeric::bigint;

  if workspace_used + reserved_cost_numeric > workspace_control.budget_microunits::numeric then
    raise exception 'Workspace scan budget exhausted' using errcode = 'P0001';
  end if;
  if project_used + reserved_cost_numeric > project_control.budget_microunits::numeric then
    raise exception 'Project scan budget exhausted' using errcode = 'P0001';
  end if;

  insert into public.scans (
    id,
    workspace_id,
    project_id,
    idempotency_key,
    request_fingerprint,
    prompt_method_version,
    profile_method_version,
    query_count,
    created_by
  ) values (
    new_scan_id,
    p_workspace_id,
    p_project_id,
    p_idempotency_key,
    request_fingerprint,
    p_prompt_method_version,
    p_profile_method_version,
    query_count,
    actor_id
  );

  insert into public.scan_queries (
    workspace_id,
    scan_id,
    query_ordinal,
    query_id,
    query_version,
    query_text
  )
  select
    p_workspace_id,
    new_scan_id,
    (query_entry.ordinality - 1)::smallint,
    query_entry.query ->> 'queryId',
    query_entry.query ->> 'queryVersion',
    query_entry.query ->> 'queryText'
  from jsonb_array_elements(p_queries) with ordinality
    as query_entry(query, ordinality);

  insert into app_private.scan_cost_reservations (
    id,
    workspace_id,
    project_id,
    scan_id,
    provider,
    model_id,
    price_version,
    currency,
    worst_case_cost_per_query_microunits,
    max_output_tokens,
    query_count,
    max_attempts,
    reserved_microunits,
    workspace_budget_window_start,
    workspace_budget_window_end,
    project_budget_window_start,
    project_budget_window_end
  ) values (
    new_reservation_id,
    p_workspace_id,
    p_project_id,
    new_scan_id,
    provider_config.provider,
    provider_config.model_id,
    provider_config.price_version,
    provider_config.currency,
    provider_config.worst_case_cost_per_query_microunits,
    provider_config.max_output_tokens,
    query_count,
    effective_max_attempts,
    reserved_cost,
    workspace_control.budget_window_start,
    workspace_control.budget_window_end,
    project_control.budget_window_start,
    project_control.budget_window_end
  );

  return jsonb_build_object(
    'scanId', new_scan_id,
    'reservationId', new_reservation_id,
    'reservedMicrounits', reserved_cost::text,
    'currency', provider_config.currency,
    'provider', provider_config.provider,
    'modelId', provider_config.model_id,
    'priceVersion', provider_config.price_version,
    'maxAttempts', effective_max_attempts,
    'maxOutputTokens', provider_config.max_output_tokens,
    'requestFingerprint', request_fingerprint,
    'replayed', false
  );
end;
$$;
revoke all on function app_private.reserve_scan(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function app_private.reserve_scan(uuid, uuid, uuid, text, text, jsonb)
  to authenticated;

create function public.reserve_scan(
  p_workspace_id uuid,
  p_project_id uuid,
  p_idempotency_key uuid,
  p_prompt_method_version text,
  p_profile_method_version text,
  p_queries jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.reserve_scan(
    p_workspace_id,
    p_project_id,
    p_idempotency_key,
    p_prompt_method_version,
    p_profile_method_version,
    p_queries
  );
$$;
revoke all on function public.reserve_scan(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_scan(uuid, uuid, uuid, text, text, jsonb)
  to authenticated;

create function app_private.settle_scan_reservation(
  p_workspace_id uuid,
  p_scan_id uuid,
  p_settlement_key uuid,
  p_settled_microunits bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation app_private.scan_cost_reservations%rowtype;
  next_status text;
begin
  if p_settlement_key is null
     or p_settled_microunits is null
     or p_settled_microunits < 0 then
    raise exception 'Invalid scan settlement' using errcode = '22023';
  end if;

  select *
  into reservation
  from app_private.scan_cost_reservations existing
  where existing.workspace_id = p_workspace_id
    and existing.scan_id = p_scan_id
  for update;
  if not found then
    raise exception 'Scan reservation not found' using errcode = 'P0001';
  end if;

  if reservation.settlement_key is not null then
    if reservation.settlement_key is distinct from p_settlement_key
       or reservation.settled_microunits is distinct from p_settled_microunits then
      raise exception 'Settlement key reused with different scan settlement'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'reservationId', reservation.id,
      'status', reservation.status,
      'reservedMicrounits', reservation.reserved_microunits::text,
      'settledMicrounits', reservation.settled_microunits::text,
      'replayed', true
    );
  end if;

  if p_settled_microunits > reservation.reserved_microunits then
    raise exception 'Settled cost exceeds reservation' using errcode = '22023';
  end if;

  next_status := case when p_settled_microunits = 0 then 'released' else 'settled' end;
  update app_private.scan_cost_reservations
  set status = next_status,
      settlement_key = p_settlement_key,
      settled_microunits = p_settled_microunits
  where id = reservation.id
  returning * into reservation;

  return jsonb_build_object(
    'reservationId', reservation.id,
    'status', reservation.status,
    'reservedMicrounits', reservation.reserved_microunits::text,
    'settledMicrounits', reservation.settled_microunits::text,
    'replayed', false
  );
end;
$$;
revoke all on function app_private.settle_scan_reservation(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant execute on function app_private.settle_scan_reservation(uuid, uuid, uuid, bigint)
  to service_role;

create function public.settle_scan_reservation(
  p_workspace_id uuid,
  p_scan_id uuid,
  p_settlement_key uuid,
  p_settled_microunits bigint
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.settle_scan_reservation(
    p_workspace_id,
    p_scan_id,
    p_settlement_key,
    p_settled_microunits
  );
$$;
revoke all on function public.settle_scan_reservation(uuid, uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.settle_scan_reservation(uuid, uuid, uuid, bigint)
  to service_role;
