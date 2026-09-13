create table app_private.scan_provider_metering_configs (
  provider text not null,
  model_id text not null,
  price_version text not null,
  cost_basis text not null default 'gross_list_price' check (
    cost_basis = 'gross_list_price'
  ),
  input_microunits_per_million_tokens bigint not null check (
    input_microunits_per_million_tokens >= 0
  ),
  output_microunits_per_million_tokens bigint not null check (
    output_microunits_per_million_tokens >= 0
  ),
  search_microunits_per_thousand_queries bigint not null check (
    search_microunits_per_thousand_queries >= 0
  ),
  created_at timestamptz not null default now(),
  primary key (provider, model_id, price_version),
  foreign key (provider, model_id, price_version)
    references app_private.scan_provider_configs (provider, model_id, price_version)
    on delete restrict
);

alter table app_private.scan_provider_metering_configs enable row level security;
revoke all on app_private.scan_provider_metering_configs
  from public, anon, authenticated, service_role;
create policy scan_provider_metering_configs_deny_clients
  on app_private.scan_provider_metering_configs
  for all to anon, authenticated using (false) with check (false);

create table public.raw_observation_usage (
  workspace_id uuid not null,
  scan_id uuid not null,
  attempt_id uuid not null,
  query_ordinal smallint not null check (query_ordinal between 0 and 9),
  observation_id uuid not null,
  provider text not null check (provider = 'gemini'),
  model_id text not null check (
    model_id = btrim(model_id)
    and char_length(model_id) between 1 and 120
  ),
  price_version text not null check (
    price_version = btrim(price_version)
    and char_length(price_version) between 1 and 120
  ),
  cost_basis text not null check (cost_basis = 'gross_list_price'),
  metering_state text not null check (
    metering_state in ('reported', 'conservative_worst_case', 'not_executed')
  ),
  prompt_token_count bigint check (prompt_token_count >= 0),
  candidates_token_count bigint check (candidates_token_count >= 0),
  thoughts_token_count bigint check (thoughts_token_count >= 0),
  tool_use_prompt_token_count bigint check (tool_use_prompt_token_count >= 0),
  total_token_count bigint check (total_token_count >= 0),
  search_query_count integer check (search_query_count between 0 and 1000),
  gross_cost_microunits bigint not null check (gross_cost_microunits >= 0),
  usage_fingerprint text not null check (usage_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, observation_id),
  foreign key (workspace_id, observation_id)
    references public.raw_observations (workspace_id, observation_id)
    on delete cascade,
  check (
    (metering_state = 'reported'
      and prompt_token_count is not null
      and candidates_token_count is not null
      and thoughts_token_count is not null
      and tool_use_prompt_token_count is not null
      and total_token_count is not null
      and search_query_count is not null)
    or (metering_state = 'conservative_worst_case'
      and prompt_token_count is null
      and candidates_token_count is null
      and thoughts_token_count is null
      and tool_use_prompt_token_count is null
      and total_token_count is null
      and search_query_count is null)
    or (metering_state = 'not_executed'
      and prompt_token_count = 0
      and candidates_token_count = 0
      and thoughts_token_count = 0
      and tool_use_prompt_token_count = 0
      and total_token_count = 0
      and search_query_count = 0
      and gross_cost_microunits = 0)
  )
);
create index raw_observation_usage_workspace_scan_idx
  on public.raw_observation_usage (workspace_id, scan_id, query_ordinal);

create table public.scan_metering_summaries (
  workspace_id uuid not null,
  scan_id uuid not null,
  reservation_id uuid not null,
  attempt_id uuid not null,
  worker_id uuid not null,
  settlement_key uuid not null,
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
  cost_basis text not null check (cost_basis = 'gross_list_price'),
  observed_usage_count smallint not null check (observed_usage_count between 0 and 100),
  unobserved_query_count smallint not null check (unobserved_query_count between 0 and 100),
  observed_cost_microunits bigint not null check (observed_cost_microunits >= 0),
  unobserved_cost_microunits bigint not null check (unobserved_cost_microunits >= 0),
  settled_microunits bigint not null check (settled_microunits >= 0),
  created_at timestamptz not null default now(),
  primary key (workspace_id, scan_id),
  unique (workspace_id, settlement_key),
  foreign key (workspace_id, scan_id)
    references public.scans (workspace_id, id)
    on delete cascade,
  foreign key (workspace_id, scan_id, attempt_id)
    references public.scan_attempts (workspace_id, scan_id, id)
    on delete restrict,
  check (settled_microunits = observed_cost_microunits + unobserved_cost_microunits)
);

create function app_private.prevent_metering_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Metering evidence is immutable' using errcode = '22023';
end;
$$;
revoke all on function app_private.prevent_metering_update()
  from public, anon, authenticated, service_role;

create trigger raw_observation_usage_prevent_update
before update on public.raw_observation_usage
for each row execute function app_private.prevent_metering_update();
create trigger scan_metering_summaries_prevent_update
before update on public.scan_metering_summaries
for each row execute function app_private.prevent_metering_update();
create trigger scan_provider_metering_configs_prevent_update
before update on app_private.scan_provider_metering_configs
for each row execute function app_private.prevent_metering_update();

alter table public.raw_observation_usage enable row level security;
alter table public.scan_metering_summaries enable row level security;
revoke all on public.raw_observation_usage, public.scan_metering_summaries
  from public, anon, authenticated, service_role;
grant select on public.raw_observation_usage, public.scan_metering_summaries
  to authenticated;

create policy raw_observation_usage_select_member
on public.raw_observation_usage
for select to authenticated
using (exists (
  select 1
  from public.workspace_memberships membership
  where membership.workspace_id = raw_observation_usage.workspace_id
    and membership.user_id = (select auth.uid())
));

create policy scan_metering_summaries_select_member
on public.scan_metering_summaries
for select to authenticated
using (exists (
  select 1
  from public.workspace_memberships membership
  where membership.workspace_id = scan_metering_summaries.workspace_id
    and membership.user_id = (select auth.uid())
));

create function app_private.gemini_usage_count(
  p_usage jsonb,
  p_key text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  raw_value jsonb;
  numeric_value numeric;
begin
  if p_usage is null or jsonb_typeof(p_usage) <> 'object' then
    raise exception 'Invalid Gemini usage metadata' using errcode = '22023';
  end if;
  if not (p_usage ? p_key) then
    return 0;
  end if;
  raw_value := p_usage -> p_key;
  if jsonb_typeof(raw_value) <> 'number'
     or raw_value::text !~ '^(0|[1-9][0-9]*)$' then
    raise exception 'Invalid Gemini usage metadata' using errcode = '22023';
  end if;
  numeric_value := raw_value::text::numeric;
  if numeric_value > 9223372036854775807::numeric then
    raise exception 'Invalid Gemini usage metadata' using errcode = '22023';
  end if;
  return numeric_value::bigint;
end;
$$;
revoke all on function app_private.gemini_usage_count(jsonb, text)
  from public, anon, authenticated, service_role;

create function app_private.settle_scan_metering(
  p_workspace_id uuid,
  p_scan_id uuid,
  p_attempt_id uuid,
  p_worker_id uuid,
  p_settlement_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation app_private.scan_cost_reservations%rowtype;
  metering app_private.scan_provider_metering_configs%rowtype;
  existing_summary public.scan_metering_summaries%rowtype;
  observation public.raw_observations%rowtype;
  payload jsonb;
  usage jsonb;
  search_queries jsonb;
  metering_state text;
  prompt_tokens bigint;
  candidate_tokens bigint;
  thought_tokens bigint;
  tool_tokens bigint;
  total_tokens bigint;
  search_count integer;
  observation_cost_numeric numeric;
  observation_cost bigint;
  usage_fingerprint text;
  observed_usage_count integer := 0;
  observed_cost_numeric numeric := 0;
  observed_cost bigint;
  unobserved_query_count integer;
  unobserved_cost_numeric numeric;
  unobserved_cost bigint;
  settled_cost_numeric numeric;
  settled_cost bigint;
  next_status text;
begin
  if p_workspace_id is null
     or p_scan_id is null
     or p_attempt_id is null
     or p_worker_id is null
     or p_settlement_key is null then
    raise exception 'Invalid scan metering settlement' using errcode = '22023';
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
    if reservation.settlement_key is distinct from p_settlement_key then
      raise exception 'Scan already settled by another execution'
        using errcode = '22023';
    end if;
    select *
    into existing_summary
    from public.scan_metering_summaries summary
    where summary.workspace_id = p_workspace_id
      and summary.scan_id = p_scan_id;
    if not found
       or existing_summary.attempt_id is distinct from p_attempt_id
       or existing_summary.worker_id is distinct from p_worker_id
       or existing_summary.settled_microunits is distinct from reservation.settled_microunits then
      raise exception 'Scan metering settlement invariant violated'
        using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'reservationId', reservation.id,
      'status', reservation.status,
      'settledMicrounits', reservation.settled_microunits::text,
      'observedUsageCount', existing_summary.observed_usage_count,
      'unobservedQueryCount', existing_summary.unobserved_query_count,
      'costBasis', existing_summary.cost_basis,
      'replayed', true
    );
  end if;

  if reservation.status <> 'reserved' then
    raise exception 'Scan reservation is not settleable' using errcode = 'P0001';
  end if;

  select *
  into metering
  from app_private.scan_provider_metering_configs config
  where config.provider = reservation.provider
    and config.model_id = reservation.model_id
    and config.price_version = reservation.price_version;
  if not found then
    raise exception 'Provider metering unavailable' using errcode = 'P0001';
  end if;

  for observation in
    select *
    from public.raw_observations evidence
    where evidence.workspace_id = p_workspace_id
      and evidence.scan_id = p_scan_id
    order by evidence.created_at, evidence.attempt_id, evidence.query_ordinal
  loop
    prompt_tokens := null;
    candidate_tokens := null;
    thought_tokens := null;
    tool_tokens := null;
    total_tokens := null;
    search_count := null;
    observation_cost := null;

    if observation.provider is distinct from reservation.provider
       or observation.requested_model is distinct from reservation.model_id then
      raise exception 'Metered observation identity mismatch' using errcode = '22023';
    end if;

    if observation.capture_mode = 'not_executed' then
      metering_state := 'not_executed';
      prompt_tokens := 0;
      candidate_tokens := 0;
      thought_tokens := 0;
      tool_tokens := 0;
      total_tokens := 0;
      search_count := 0;
      observation_cost := 0;
    elsif observation.raw_response_state = 'complete' then
      begin
        payload := observation.raw_response::jsonb;
      exception when others then
        payload := null;
      end;

      if payload is null
         or jsonb_typeof(payload) <> 'object'
         or not (payload ? 'usageMetadata') then
        metering_state := 'conservative_worst_case';
        observation_cost := reservation.worst_case_cost_per_query_microunits;
      else
        usage := payload -> 'usageMetadata';
        if jsonb_typeof(usage) <> 'object' then
          raise exception 'Invalid Gemini usage metadata' using errcode = '22023';
        end if;

        prompt_tokens := app_private.gemini_usage_count(usage, 'promptTokenCount');
        candidate_tokens := app_private.gemini_usage_count(usage, 'candidatesTokenCount');
        thought_tokens := app_private.gemini_usage_count(usage, 'thoughtsTokenCount');
        tool_tokens := app_private.gemini_usage_count(usage, 'toolUsePromptTokenCount');
        total_tokens := app_private.gemini_usage_count(usage, 'totalTokenCount');
        search_count := 0;

        if observation.grounding_metadata is not null
           and observation.grounding_metadata ? 'webSearchQueries' then
          search_queries := observation.grounding_metadata -> 'webSearchQueries';
          if jsonb_typeof(search_queries) <> 'array'
             or jsonb_array_length(search_queries) > 1000
             or exists (
               select 1
               from jsonb_array_elements(search_queries) entry(value)
               where jsonb_typeof(entry.value) <> 'string'
             ) then
            raise exception 'Invalid Gemini search usage metadata' using errcode = '22023';
          end if;

          select count(distinct btrim(entry.value #>> '{}'))::integer
          into search_count
          from jsonb_array_elements(search_queries) entry(value)
          where btrim(entry.value #>> '{}') <> '';
        end if;

        observation_cost_numeric :=
          ceil(
            prompt_tokens::numeric
            * metering.input_microunits_per_million_tokens::numeric
            / 1000000::numeric
          )
          + ceil(
            (candidate_tokens::numeric + thought_tokens::numeric)
            * metering.output_microunits_per_million_tokens::numeric
            / 1000000::numeric
          )
          + ceil(
            search_count::numeric
            * metering.search_microunits_per_thousand_queries::numeric
            / 1000::numeric
          );
        if observation_cost_numeric > 9223372036854775807::numeric then
          raise exception 'Metered cost overflow' using errcode = '22003';
        end if;
        observation_cost := observation_cost_numeric::bigint;
        metering_state := 'reported';
      end if;
    else
      metering_state := 'conservative_worst_case';
      observation_cost := reservation.worst_case_cost_per_query_microunits;
    end if;

    if observation_cost > reservation.worst_case_cost_per_query_microunits then
      raise exception 'Metered cost exceeds reserved worst case' using errcode = '22023';
    end if;

    usage_fingerprint := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'observationId', observation.observation_id,
            'priceVersion', reservation.price_version,
            'costBasis', metering.cost_basis,
            'meteringState', metering_state,
            'promptTokenCount', prompt_tokens,
            'candidatesTokenCount', candidate_tokens,
            'thoughtsTokenCount', thought_tokens,
            'toolUsePromptTokenCount', tool_tokens,
            'totalTokenCount', total_tokens,
            'searchQueryCount', search_count,
            'grossCostMicrounits', observation_cost
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.raw_observation_usage (
      workspace_id,
      scan_id,
      attempt_id,
      query_ordinal,
      observation_id,
      provider,
      model_id,
      price_version,
      cost_basis,
      metering_state,
      prompt_token_count,
      candidates_token_count,
      thoughts_token_count,
      tool_use_prompt_token_count,
      total_token_count,
      search_query_count,
      gross_cost_microunits,
      usage_fingerprint
    ) values (
      p_workspace_id,
      p_scan_id,
      observation.attempt_id,
      observation.query_ordinal,
      observation.observation_id,
      reservation.provider,
      reservation.model_id,
      reservation.price_version,
      metering.cost_basis,
      metering_state,
      prompt_tokens,
      candidate_tokens,
      thought_tokens,
      tool_tokens,
      total_tokens,
      search_count,
      observation_cost,
      usage_fingerprint
    );

    observed_usage_count := observed_usage_count + 1;
    observed_cost_numeric := observed_cost_numeric + observation_cost::numeric;
  end loop;

  if observed_usage_count > 100 then
    raise exception 'Too many metered observations' using errcode = '22023';
  end if;
  if observed_cost_numeric > 9223372036854775807::numeric then
    raise exception 'Metered cost overflow' using errcode = '22003';
  end if;
  observed_cost := observed_cost_numeric::bigint;

  select count(*)::integer
  into unobserved_query_count
  from public.scan_attempt_queries attempt_query
  left join public.raw_observations evidence
    on evidence.workspace_id = attempt_query.workspace_id
   and evidence.scan_id = attempt_query.scan_id
   and evidence.attempt_id = attempt_query.attempt_id
   and evidence.query_ordinal = attempt_query.query_ordinal
   and evidence.observation_id = attempt_query.observation_id
  where attempt_query.workspace_id = p_workspace_id
    and attempt_query.scan_id = p_scan_id
    and evidence.observation_id is null;

  if unobserved_query_count > 100 then
    raise exception 'Too many unobserved scan queries' using errcode = '22023';
  end if;

  unobserved_cost_numeric :=
    unobserved_query_count::numeric
    * reservation.worst_case_cost_per_query_microunits::numeric;
  if unobserved_cost_numeric > 9223372036854775807::numeric then
    raise exception 'Metered cost overflow' using errcode = '22003';
  end if;
  unobserved_cost := unobserved_cost_numeric::bigint;
  settled_cost_numeric := observed_cost_numeric + unobserved_cost_numeric;
  if settled_cost_numeric > reservation.reserved_microunits::numeric then
    raise exception 'Metered cost exceeds reservation' using errcode = '22023';
  end if;
  settled_cost := settled_cost_numeric::bigint;
  next_status := case when settled_cost = 0 then 'released' else 'settled' end;

  update app_private.scan_cost_reservations
  set status = next_status,
      settlement_key = p_settlement_key,
      settled_microunits = settled_cost
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
    p_workspace_id,
    p_scan_id,
    reservation.id,
    p_attempt_id,
    p_worker_id,
    p_settlement_key,
    reservation.provider,
    reservation.model_id,
    reservation.price_version,
    reservation.currency,
    metering.cost_basis,
    observed_usage_count,
    unobserved_query_count,
    observed_cost,
    unobserved_cost,
    settled_cost
  );

  return jsonb_build_object(
    'reservationId', reservation.id,
    'status', reservation.status,
    'settledMicrounits', settled_cost::text,
    'observedUsageCount', observed_usage_count,
    'unobservedQueryCount', unobserved_query_count,
    'costBasis', metering.cost_basis,
    'replayed', false
  );
end;
$$;
revoke all on function app_private.settle_scan_metering(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function app_private.complete_scan_work(
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
  scan public.scans%rowtype;
  attempt public.scan_attempts%rowtype;
  reservation app_private.scan_cost_reservations%rowtype;
  summary public.scan_metering_summaries%rowtype;
  query_count integer;
  partial_count integer;
  next_state text;
  settlement jsonb;
begin
  if p_workspace_id is null
     or p_scan_id is null
     or p_attempt_id is null
     or p_worker_id is null
     or p_lease_token is null then
    raise exception 'Invalid scan completion request' using errcode = '22023';
  end if;

  select *
  into reservation
  from app_private.scan_cost_reservations existing
  where existing.workspace_id = p_workspace_id
    and existing.scan_id = p_scan_id;
  if reservation.settlement_key = p_lease_token then
    select * into summary
    from public.scan_metering_summaries existing_summary
    where existing_summary.workspace_id = p_workspace_id
      and existing_summary.scan_id = p_scan_id;
    select * into scan
    from public.scans existing_scan
    where existing_scan.workspace_id = p_workspace_id
      and existing_scan.id = p_scan_id;
    select * into attempt
    from public.scan_attempts existing_attempt
    where existing_attempt.workspace_id = p_workspace_id
      and existing_attempt.scan_id = p_scan_id
      and existing_attempt.id = p_attempt_id;
    if found
       and summary.attempt_id = p_attempt_id
       and summary.worker_id = p_worker_id
       and scan.state in ('completed', 'partial')
       and attempt.state = scan.state then
      return jsonb_build_object(
        'workspaceId', p_workspace_id,
        'scanId', p_scan_id,
        'attemptId', p_attempt_id,
        'state', scan.state,
        'reservationStatus', reservation.status,
        'settledMicrounits', reservation.settled_microunits::text,
        'costBasis', summary.cost_basis,
        'replayed', true
      );
    end if;
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
  into scan
  from public.scans existing_scan
  where existing_scan.workspace_id = p_workspace_id
    and existing_scan.id = p_scan_id
  for update;
  if not found or scan.state <> 'running' then
    raise exception 'Scan lease invariant violated' using errcode = 'P0001';
  end if;

  select *
  into attempt
  from public.scan_attempts existing_attempt
  where existing_attempt.workspace_id = p_workspace_id
    and existing_attempt.scan_id = p_scan_id
    and existing_attempt.id = p_attempt_id
  for update;
  if not found or attempt.state <> 'running' then
    raise exception 'Scan lease invariant violated' using errcode = 'P0001';
  end if;

  select count(*)::integer,
         count(*) filter (where attempt_query.state in ('partial', 'refused'))::integer
  into query_count, partial_count
  from public.scan_attempt_queries attempt_query
  where attempt_query.workspace_id = p_workspace_id
    and attempt_query.scan_id = p_scan_id
    and attempt_query.attempt_id = p_attempt_id;

  if query_count <> scan.query_count
     or exists (
       select 1
       from public.scan_attempt_queries attempt_query
       where attempt_query.workspace_id = p_workspace_id
         and attempt_query.scan_id = p_scan_id
         and attempt_query.attempt_id = p_attempt_id
         and attempt_query.state not in ('answered', 'partial', 'refused')
     )
     or exists (
       select 1
       from public.scan_attempt_queries attempt_query
       left join public.raw_observations evidence
         on evidence.workspace_id = attempt_query.workspace_id
        and evidence.scan_id = attempt_query.scan_id
        and evidence.attempt_id = attempt_query.attempt_id
        and evidence.query_ordinal = attempt_query.query_ordinal
        and evidence.observation_id = attempt_query.observation_id
       where attempt_query.workspace_id = p_workspace_id
         and attempt_query.scan_id = p_scan_id
         and attempt_query.attempt_id = p_attempt_id
         and evidence.observation_id is null
     ) then
    raise exception 'Scan evidence incomplete' using errcode = 'P0001';
  end if;

  settlement := app_private.settle_scan_metering(
    p_workspace_id,
    p_scan_id,
    p_attempt_id,
    p_worker_id,
    p_lease_token
  );
  next_state := case when partial_count > 0 then 'partial' else 'completed' end;

  update public.scan_attempts
  set state = next_state,
      finished_at = now_at
  where workspace_id = p_workspace_id
    and scan_id = p_scan_id
    and id = p_attempt_id;

  update public.scans
  set state = next_state
  where workspace_id = p_workspace_id
    and id = p_scan_id;

  delete from app_private.scan_worker_leases
  where workspace_id = p_workspace_id
    and scan_id = p_scan_id;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'scanId', p_scan_id,
    'attemptId', p_attempt_id,
    'state', next_state,
    'reservationStatus', settlement ->> 'status',
    'settledMicrounits', settlement ->> 'settledMicrounits',
    'costBasis', settlement ->> 'costBasis',
    'replayed', false
  );
end;
$$;
revoke all on function app_private.complete_scan_work(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.complete_scan_work(uuid, uuid, uuid, uuid, uuid)
  to service_role;

create function public.complete_scan_work(
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
  select app_private.complete_scan_work(
    p_workspace_id,
    p_scan_id,
    p_attempt_id,
    p_worker_id,
    p_lease_token
  );
$$;
revoke all on function public.complete_scan_work(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_scan_work(uuid, uuid, uuid, uuid, uuid)
  to service_role;
