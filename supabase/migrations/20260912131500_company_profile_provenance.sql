create table public.company_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  idempotency_key uuid not null,
  request_fingerprint text not null check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  capture_method_version text not null check (
    capture_method_version = 'native-entry-page-v1'
  ),
  captured_at timestamptz not null,
  crawl_result jsonb not null,
  profile_method_version text not null check (
    profile_method_version = 'company-profile-v2'
  ),
  profile jsonb not null,
  review_state text not null default 'pending_review' check (
    review_state in ('pending_review', 'accepted', 'needs_correction')
  ),
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, project_id)
    references public.projects (workspace_id, id)
    on delete cascade,
  check (
    jsonb_typeof(crawl_result) = 'object'
    and crawl_result -> 'ok' = 'true'::jsonb
    and jsonb_typeof(crawl_result -> 'pages') = 'array'
    and jsonb_array_length(crawl_result -> 'pages') = 1
    and octet_length(crawl_result::text) <= 2097152
  ),
  check (
    jsonb_typeof(profile) = 'object'
    and profile ->> 'methodVersion' = profile_method_version
    and jsonb_typeof(profile -> 'fields') = 'object'
    and (profile -> 'fields') ?& array[
      'companyName',
      'productName',
      'shortDescription',
      'primaryProduct',
      'targetAudience',
      'industry',
      'keyUseCases',
      'capabilities',
      'geography'
    ]
    and jsonb_typeof(profile -> 'excludedPages') = 'array'
    and octet_length(profile::text) <= 524288
  )
);
create index company_profile_snapshots_workspace_project_captured_at_idx
  on public.company_profile_snapshots (workspace_id, project_id, captured_at desc);

create function app_private.prevent_company_profile_snapshot_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Company profile snapshots are immutable' using errcode = '22023';
end;
$$;
revoke all on function app_private.prevent_company_profile_snapshot_update()
  from public, anon, authenticated, service_role;

create trigger company_profile_snapshots_prevent_update
before update on public.company_profile_snapshots
for each row execute function app_private.prevent_company_profile_snapshot_update();

alter table public.company_profile_snapshots enable row level security;
revoke all on public.company_profile_snapshots
  from public, anon, authenticated, service_role;
grant select on public.company_profile_snapshots to authenticated;

create policy company_profile_snapshots_select_member
on public.company_profile_snapshots
for select to authenticated
using (exists (
  select 1
  from public.workspace_memberships membership
  where membership.workspace_id = company_profile_snapshots.workspace_id
    and membership.user_id = (select auth.uid())
));

create function app_private.persist_company_profile_snapshot(
  p_workspace_id uuid,
  p_project_id uuid,
  p_idempotency_key uuid,
  p_captured_at timestamptz,
  p_crawl_result jsonb,
  p_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_fingerprint text;
  snapshot_id uuid;
  existing public.company_profile_snapshots%rowtype;
  inserted boolean := false;
begin
  if p_workspace_id is null
     or p_project_id is null
     or p_idempotency_key is null
     or p_captured_at is null
     or p_crawl_result is null
     or p_profile is null then
    raise exception 'Invalid company profile snapshot request' using errcode = '22023';
  end if;

  if jsonb_typeof(p_crawl_result) <> 'object'
     or p_crawl_result -> 'ok' is distinct from 'true'::jsonb
     or jsonb_typeof(p_crawl_result -> 'pages') <> 'array'
     or jsonb_array_length(p_crawl_result -> 'pages') <> 1
     or octet_length(p_crawl_result::text) > 2097152 then
    raise exception 'Invalid crawl snapshot' using errcode = '22023';
  end if;

  if jsonb_typeof(p_profile) <> 'object'
     or p_profile ->> 'methodVersion' is distinct from 'company-profile-v2'
     or jsonb_typeof(p_profile -> 'fields') <> 'object'
     or not ((p_profile -> 'fields') ?& array[
       'companyName',
       'productName',
       'shortDescription',
       'primaryProduct',
       'targetAudience',
       'industry',
       'keyUseCases',
       'capabilities',
       'geography'
     ])
     or jsonb_typeof(p_profile -> 'excludedPages') <> 'array'
     or octet_length(p_profile::text) > 524288 then
    raise exception 'Invalid company profile snapshot' using errcode = '22023';
  end if;

  perform 1
  from public.projects project
  where project.workspace_id = p_workspace_id
    and project.id = p_project_id
  for key share;
  if not found then
    raise exception 'Project not found for company profile snapshot' using errcode = '23503';
  end if;

  request_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'projectId', p_project_id::text,
          'captureMethodVersion', 'native-entry-page-v1',
          'capturedAt', p_captured_at,
          'crawlResult', p_crawl_result,
          'profileMethodVersion', 'company-profile-v2',
          'profile', p_profile
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.company_profile_snapshots (
    workspace_id,
    project_id,
    idempotency_key,
    request_fingerprint,
    capture_method_version,
    captured_at,
    crawl_result,
    profile_method_version,
    profile
  ) values (
    p_workspace_id,
    p_project_id,
    p_idempotency_key,
    request_fingerprint,
    'native-entry-page-v1',
    p_captured_at,
    p_crawl_result,
    'company-profile-v2',
    p_profile
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into snapshot_id;

  inserted := snapshot_id is not null;

  if not inserted then
    select *
    into existing
    from public.company_profile_snapshots snapshot
    where snapshot.workspace_id = p_workspace_id
      and snapshot.idempotency_key = p_idempotency_key
    for share;

    if not found then
      raise exception 'Company profile snapshot replay missing' using errcode = 'P0001';
    end if;

    if existing.project_id is distinct from p_project_id
       or existing.request_fingerprint is distinct from request_fingerprint
       or existing.capture_method_version is distinct from 'native-entry-page-v1'
       or existing.captured_at is distinct from p_captured_at
       or existing.crawl_result is distinct from p_crawl_result
       or existing.profile_method_version is distinct from 'company-profile-v2'
       or existing.profile is distinct from p_profile then
      raise exception 'Idempotency key reused with different company profile snapshot'
        using errcode = '22023';
    end if;

    snapshot_id := existing.id;
  end if;

  return jsonb_build_object(
    'snapshotId', snapshot_id,
    'requestFingerprint', request_fingerprint,
    'reviewState', 'pending_review',
    'replayed', not inserted
  );
end;
$$;
revoke all on function app_private.persist_company_profile_snapshot(
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function app_private.persist_company_profile_snapshot(
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb,
  jsonb
) to service_role;

create function public.persist_company_profile_snapshot(
  p_workspace_id uuid,
  p_project_id uuid,
  p_idempotency_key uuid,
  p_captured_at timestamptz,
  p_crawl_result jsonb,
  p_profile jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.persist_company_profile_snapshot(
    p_workspace_id,
    p_project_id,
    p_idempotency_key,
    p_captured_at,
    p_crawl_result,
    p_profile
  );
$$;
revoke all on function public.persist_company_profile_snapshot(
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.persist_company_profile_snapshot(
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb,
  jsonb
) to service_role;
