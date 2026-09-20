create table public.scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  idempotency_key uuid not null,
  request_fingerprint text not null check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  state text not null default 'queued' check (
    state in ('queued', 'running', 'partial', 'completed', 'failed', 'cancelled')
  ),
  prompt_method_version text not null check (
    prompt_method_version = btrim(prompt_method_version)
    and char_length(prompt_method_version) between 1 and 120
  ),
  profile_method_version text not null check (
    profile_method_version = btrim(profile_method_version)
    and char_length(profile_method_version) between 1 and 120
  ),
  query_count smallint not null check (query_count between 0 and 10),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, project_id)
    references public.projects (workspace_id, id)
    on delete cascade
);
create index scans_workspace_project_created_at_idx
  on public.scans (workspace_id, project_id, created_at desc);

create table public.scan_queries (
  workspace_id uuid not null,
  scan_id uuid not null,
  query_ordinal smallint not null check (query_ordinal between 0 and 9),
  query_id text not null check (
    char_length(query_id) between 1 and 8192
  ),
  query_version text not null check (
    query_version = btrim(query_version)
    and char_length(query_version) between 1 and 120
  ),
  query_text text not null check (
    char_length(query_text) between 1 and 600
    and char_length(btrim(query_text)) > 0
  ),
  created_at timestamptz not null default now(),
  primary key (workspace_id, scan_id, query_ordinal),
  foreign key (workspace_id, scan_id)
    references public.scans (workspace_id, id)
    on delete cascade
);

create table public.scan_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  scan_id uuid not null,
  attempt_number smallint not null check (attempt_number >= 1),
  state text not null default 'queued' check (
    state in ('queued', 'running', 'partial', 'completed', 'failed', 'cancelled')
  ),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, scan_id, id),
  unique (workspace_id, scan_id, attempt_number),
  foreign key (workspace_id, scan_id)
    references public.scans (workspace_id, id)
    on delete cascade,
  check (finished_at is null or started_at is not null),
  check (finished_at is null or finished_at >= started_at)
);
create index scan_attempts_workspace_scan_created_at_idx
  on public.scan_attempts (workspace_id, scan_id, created_at);

create table public.scan_attempt_queries (
  workspace_id uuid not null,
  scan_id uuid not null,
  attempt_id uuid not null,
  query_ordinal smallint not null check (query_ordinal between 0 and 9),
  observation_id uuid not null default gen_random_uuid(),
  state text not null default 'unattempted' check (
    state in (
      'unattempted',
      'running',
      'answered',
      'partial',
      'refused',
      'failed',
      'cancelled',
      'boundary_failure'
    )
  ),
  boundary_failure_code text check (
    boundary_failure_code is null
    or boundary_failure_code in (
      'invalid_request',
      'invalid_clock',
      'provider_exception'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, attempt_id, query_ordinal),
  unique (workspace_id, observation_id),
  foreign key (workspace_id, scan_id, query_ordinal)
    references public.scan_queries (workspace_id, scan_id, query_ordinal)
    on delete cascade,
  foreign key (workspace_id, scan_id, attempt_id)
    references public.scan_attempts (workspace_id, scan_id, id)
    on delete cascade,
  check (
    (state = 'boundary_failure' and boundary_failure_code is not null)
    or (state <> 'boundary_failure' and boundary_failure_code is null)
  )
);
create index scan_attempt_queries_workspace_scan_idx
  on public.scan_attempt_queries (workspace_id, scan_id, query_ordinal);

create function app_private.enforce_scan_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.workspace_id is distinct from old.workspace_id
     or new.project_id is distinct from old.project_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.request_fingerprint is distinct from old.request_fingerprint
     or new.prompt_method_version is distinct from old.prompt_method_version
     or new.profile_method_version is distinct from old.profile_method_version
     or new.query_count is distinct from old.query_count
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Scan request identity is immutable' using errcode = '22023';
  end if;

  if new.state = old.state then
    return new;
  end if;

  if not (
    (old.state = 'queued' and new.state in ('running', 'failed', 'cancelled'))
    or (
      old.state = 'running'
      and new.state in ('queued', 'partial', 'completed', 'failed', 'cancelled')
    )
  ) then
    raise exception 'Invalid scan state transition: % -> %', old.state, new.state
      using errcode = '22023';
  end if;

  return new;
end;
$$;
revoke all on function app_private.enforce_scan_update()
  from public, anon, authenticated;

create function app_private.prevent_scan_query_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Scan query snapshots are immutable' using errcode = '22023';
end;
$$;
revoke all on function app_private.prevent_scan_query_update()
  from public, anon, authenticated;

create function app_private.enforce_scan_attempt_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.workspace_id is distinct from old.workspace_id
     or new.scan_id is distinct from old.scan_id
     or new.attempt_number is distinct from old.attempt_number
     or new.created_at is distinct from old.created_at then
    raise exception 'Scan attempt identity is immutable' using errcode = '22023';
  end if;

  if new.state = old.state then
    return new;
  end if;

  if not (
    (old.state = 'queued' and new.state in ('running', 'failed', 'cancelled'))
    or (
      old.state = 'running'
      and new.state in ('partial', 'completed', 'failed', 'cancelled')
    )
  ) then
    raise exception 'Invalid scan attempt state transition: % -> %', old.state, new.state
      using errcode = '22023';
  end if;

  return new;
end;
$$;
revoke all on function app_private.enforce_scan_attempt_update()
  from public, anon, authenticated;

create function app_private.enforce_scan_attempt_query_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.scan_id is distinct from old.scan_id
     or new.attempt_id is distinct from old.attempt_id
     or new.query_ordinal is distinct from old.query_ordinal
     or new.observation_id is distinct from old.observation_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Scan observation identity is immutable' using errcode = '22023';
  end if;

  if new.state = old.state then
    return new;
  end if;

  if not (
    (
      old.state = 'unattempted'
      and new.state in (
        'running',
        'answered',
        'partial',
        'refused',
        'failed',
        'cancelled',
        'boundary_failure'
      )
    )
    or (
      old.state = 'running'
      and new.state in (
        'answered',
        'partial',
        'refused',
        'failed',
        'cancelled',
        'boundary_failure'
      )
    )
  ) then
    raise exception 'Invalid scan query state transition: % -> %', old.state, new.state
      using errcode = '22023';
  end if;

  return new;
end;
$$;
revoke all on function app_private.enforce_scan_attempt_query_update()
  from public, anon, authenticated;

create trigger scans_enforce_update
before update on public.scans
for each row execute function app_private.enforce_scan_update();
create trigger scans_touch_updated_at
before update on public.scans
for each row execute function app_private.touch_updated_at();

create trigger scan_queries_prevent_update
before update on public.scan_queries
for each row execute function app_private.prevent_scan_query_update();

create trigger scan_attempts_enforce_update
before update on public.scan_attempts
for each row execute function app_private.enforce_scan_attempt_update();
create trigger scan_attempts_touch_updated_at
before update on public.scan_attempts
for each row execute function app_private.touch_updated_at();

create trigger scan_attempt_queries_enforce_update
before update on public.scan_attempt_queries
for each row execute function app_private.enforce_scan_attempt_query_update();
create trigger scan_attempt_queries_touch_updated_at
before update on public.scan_attempt_queries
for each row execute function app_private.touch_updated_at();

alter table public.scans enable row level security;
alter table public.scan_queries enable row level security;
alter table public.scan_attempts enable row level security;
alter table public.scan_attempt_queries enable row level security;

revoke all on public.scans, public.scan_queries, public.scan_attempts, public.scan_attempt_queries
  from public, anon, authenticated;
grant select on public.scans, public.scan_queries, public.scan_attempts, public.scan_attempt_queries
  to authenticated;

create policy scans_select_member on public.scans
  for select to authenticated using (exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = scans.workspace_id
      and membership.user_id = (select auth.uid())
  ));

create policy scan_queries_select_member on public.scan_queries
  for select to authenticated using (exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = scan_queries.workspace_id
      and membership.user_id = (select auth.uid())
  ));

create policy scan_attempts_select_member on public.scan_attempts
  for select to authenticated using (exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = scan_attempts.workspace_id
      and membership.user_id = (select auth.uid())
  ));

create policy scan_attempt_queries_select_member on public.scan_attempt_queries
  for select to authenticated using (exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = scan_attempt_queries.workspace_id
      and membership.user_id = (select auth.uid())
  ));
