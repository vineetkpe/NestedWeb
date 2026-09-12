alter table public.company_profile_snapshots
  add constraint company_profile_snapshots_workspace_project_id_key
  unique (workspace_id, project_id, id);

alter table public.scans
  add constraint scans_workspace_project_id_key
  unique (workspace_id, project_id, id);

create table public.prompt_cohorts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  profile_snapshot_id uuid not null,
  idempotency_key uuid not null,
  request_fingerprint text not null check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  prompt_method_version text not null check (
    prompt_method_version = 'niche-prompts-v1'
  ),
  profile_method_version text not null check (
    profile_method_version = 'company-profile-v2'
  ),
  language text not null check (language = 'en'),
  locale text check (locale is null),
  query_count smallint not null check (query_count between 0 and 10),
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, project_id, id),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, project_id, profile_snapshot_id)
    references public.company_profile_snapshots (workspace_id, project_id, id)
    on delete cascade
);
create index prompt_cohorts_profile_snapshot_idx
  on public.prompt_cohorts (workspace_id, project_id, profile_snapshot_id);
create index prompt_cohorts_project_created_at_idx
  on public.prompt_cohorts (workspace_id, project_id, created_at desc);

create table public.prompt_cohort_queries (
  workspace_id uuid not null,
  project_id uuid not null,
  cohort_id uuid not null,
  query_ordinal smallint not null check (query_ordinal between 0 and 9),
  query_id text not null check (
    char_length(query_id) between 1 and 8192
    and position('niche-prompts-v1:' in query_id) = 1
  ),
  category text not null check (
    category in (
      'category-discovery',
      'best-tools-platforms',
      'alternatives',
      'comparison',
      'use-case-recommendation',
      'buyer-intent'
    )
  ),
  template_version text not null check (
    template_version in (
      'category@v1',
      'service-area@v1',
      'best-audience@v1',
      'alternatives@v1',
      'comparison-category@v1',
      'use-case@v1',
      'use-case-audience@v1',
      'buyer@v1'
    )
  ),
  query_text text not null check (
    char_length(query_text) between 1 and 600
    and btrim(query_text) <> ''
    and query_text !~ '[[:cntrl:]]'
  ),
  language text not null check (language = 'en'),
  locale text check (locale is null),
  state text not null check (state = 'planned'),
  evidence_refs jsonb not null check (
    jsonb_typeof(evidence_refs) = 'array'
    and jsonb_array_length(evidence_refs) between 1 and 2
    and octet_length(evidence_refs::text) <= 65536
  ),
  created_at timestamptz not null default now(),
  primary key (workspace_id, project_id, cohort_id, query_ordinal),
  unique (workspace_id, cohort_id, query_id),
  foreign key (workspace_id, project_id, cohort_id)
    references public.prompt_cohorts (workspace_id, project_id, id)
    on delete cascade,
  check (
    (template_version = 'category@v1' and category = 'category-discovery')
    or (template_version = 'service-area@v1' and category = 'category-discovery')
    or (template_version = 'best-audience@v1' and category = 'best-tools-platforms')
    or (template_version = 'alternatives@v1' and category = 'alternatives')
    or (template_version = 'comparison-category@v1' and category = 'comparison')
    or (template_version = 'use-case@v1' and category = 'use-case-recommendation')
    or (template_version = 'use-case-audience@v1' and category = 'use-case-recommendation')
    or (template_version = 'buyer@v1' and category = 'buyer-intent')
  )
);

create table public.scan_prompt_cohorts (
  workspace_id uuid not null,
  project_id uuid not null,
  scan_id uuid not null,
  prompt_cohort_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, project_id, scan_id),
  unique (workspace_id, scan_id),
  foreign key (workspace_id, project_id, scan_id)
    references public.scans (workspace_id, project_id, id)
    on delete cascade,
  foreign key (workspace_id, project_id, prompt_cohort_id)
    references public.prompt_cohorts (workspace_id, project_id, id)
    on delete restrict
);
create index scan_prompt_cohorts_prompt_cohort_idx
  on public.scan_prompt_cohorts (workspace_id, project_id, prompt_cohort_id);

create function app_private.prevent_prompt_provenance_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Prompt provenance rows are immutable' using errcode = '22023';
end;
$$;
revoke all on function app_private.prevent_prompt_provenance_update()
  from public, anon, authenticated, service_role;

create trigger prompt_cohorts_prevent_update
before update on public.prompt_cohorts
for each row execute function app_private.prevent_prompt_provenance_update();
create trigger prompt_cohort_queries_prevent_update
before update on public.prompt_cohort_queries
for each row execute function app_private.prevent_prompt_provenance_update();
create trigger scan_prompt_cohorts_prevent_update
before update on public.scan_prompt_cohorts
for each row execute function app_private.prevent_prompt_provenance_update();

alter table public.prompt_cohorts enable row level security;
alter table public.prompt_cohort_queries enable row level security;
alter table public.scan_prompt_cohorts enable row level security;

revoke all on public.prompt_cohorts,
  public.prompt_cohort_queries,
  public.scan_prompt_cohorts
from public, anon, authenticated, service_role;
grant select on public.prompt_cohorts,
  public.prompt_cohort_queries,
  public.scan_prompt_cohorts
to authenticated;

create policy prompt_cohorts_select_member
on public.prompt_cohorts
for select to authenticated
using (exists (
  select 1
  from public.workspace_memberships membership
  where membership.workspace_id = prompt_cohorts.workspace_id
    and membership.user_id = (select auth.uid())
));

create policy prompt_cohort_queries_select_member
on public.prompt_cohort_queries
for select to authenticated
using (exists (
  select 1
  from public.workspace_memberships membership
  where membership.workspace_id = prompt_cohort_queries.workspace_id
    and membership.user_id = (select auth.uid())
));

create policy scan_prompt_cohorts_select_member
on public.scan_prompt_cohorts
for select to authenticated
using (exists (
  select 1
  from public.workspace_memberships membership
  where membership.workspace_id = scan_prompt_cohorts.workspace_id
    and membership.user_id = (select auth.uid())
));

create function app_private.persist_prompt_cohort(
  p_workspace_id uuid,
  p_project_id uuid,
  p_profile_snapshot_id uuid,
  p_idempotency_key uuid,
  p_profile jsonb,
  p_prompts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_snapshot public.company_profile_snapshots%rowtype;
  existing public.prompt_cohorts%rowtype;
  cohort_id uuid;
  request_fingerprint text;
  prompt_count integer;
  prompt_entry jsonb;
  evidence_ref jsonb;
  evidence_index_value jsonb;
  profile_field jsonb;
  profile_value jsonb;
  value_index integer;
  evidence_index integer;
  seen_query_ids text[] := array[]::text[];
  seen_evidence_indexes integer[];
  inserted boolean := false;
begin
  if p_workspace_id is null
     or p_project_id is null
     or p_profile_snapshot_id is null
     or p_idempotency_key is null
     or p_profile is null
     or p_prompts is null then
    raise exception 'Invalid prompt cohort request' using errcode = '22023';
  end if;

  select *
  into profile_snapshot
  from public.company_profile_snapshots snapshot
  where snapshot.workspace_id = p_workspace_id
    and snapshot.project_id = p_project_id
    and snapshot.id = p_profile_snapshot_id
  for key share;
  if not found then
    raise exception 'Profile snapshot not found for prompt cohort' using errcode = '23503';
  end if;

  if profile_snapshot.profile_method_version is distinct from 'company-profile-v2'
     or profile_snapshot.profile is distinct from p_profile then
    raise exception 'Profile payload does not match stored snapshot' using errcode = '22023';
  end if;

  if jsonb_typeof(p_prompts) <> 'array' then
    raise exception 'Invalid prompt cohort' using errcode = '22023';
  end if;
  prompt_count := jsonb_array_length(p_prompts);
  if prompt_count < 0 or prompt_count > 10 then
    raise exception 'Invalid prompt cohort' using errcode = '22023';
  end if;

  for prompt_entry in
    select value from jsonb_array_elements(p_prompts)
  loop
    if jsonb_typeof(prompt_entry) <> 'object'
       or not (prompt_entry ?& array[
         'queryId',
         'category',
         'text',
         'templateVersion',
         'language',
         'locale',
         'state',
         'evidenceRefs'
       ])
       or (select count(*) from jsonb_object_keys(prompt_entry)) <> 8
       or jsonb_typeof(prompt_entry -> 'queryId') <> 'string'
       or char_length(prompt_entry ->> 'queryId') < 1
       or char_length(prompt_entry ->> 'queryId') > 8192
       or position('niche-prompts-v1:' in prompt_entry ->> 'queryId') <> 1
       or jsonb_typeof(prompt_entry -> 'category') <> 'string'
       or jsonb_typeof(prompt_entry -> 'text') <> 'string'
       or char_length(prompt_entry ->> 'text') < 1
       or char_length(prompt_entry ->> 'text') > 600
       or btrim(prompt_entry ->> 'text') = ''
       or prompt_entry ->> 'text' ~ '[[:cntrl:]]'
       or jsonb_typeof(prompt_entry -> 'templateVersion') <> 'string'
       or prompt_entry ->> 'language' is distinct from 'en'
       or prompt_entry -> 'locale' is distinct from 'null'::jsonb
       or prompt_entry ->> 'state' is distinct from 'planned'
       or jsonb_typeof(prompt_entry -> 'evidenceRefs') <> 'array'
       or jsonb_array_length(prompt_entry -> 'evidenceRefs') < 1
       or jsonb_array_length(prompt_entry -> 'evidenceRefs') > 2 then
      raise exception 'Invalid prompt cohort' using errcode = '22023';
    end if;

    if not (
      (prompt_entry ->> 'templateVersion' = 'category@v1'
        and prompt_entry ->> 'category' = 'category-discovery')
      or (prompt_entry ->> 'templateVersion' = 'service-area@v1'
        and prompt_entry ->> 'category' = 'category-discovery')
      or (prompt_entry ->> 'templateVersion' = 'best-audience@v1'
        and prompt_entry ->> 'category' = 'best-tools-platforms')
      or (prompt_entry ->> 'templateVersion' = 'alternatives@v1'
        and prompt_entry ->> 'category' = 'alternatives')
      or (prompt_entry ->> 'templateVersion' = 'comparison-category@v1'
        and prompt_entry ->> 'category' = 'comparison')
      or (prompt_entry ->> 'templateVersion' = 'use-case@v1'
        and prompt_entry ->> 'category' = 'use-case-recommendation')
      or (prompt_entry ->> 'templateVersion' = 'use-case-audience@v1'
        and prompt_entry ->> 'category' = 'use-case-recommendation')
      or (prompt_entry ->> 'templateVersion' = 'buyer@v1'
        and prompt_entry ->> 'category' = 'buyer-intent')
    ) then
      raise exception 'Invalid prompt cohort' using errcode = '22023';
    end if;

    if prompt_entry ->> 'queryId' = any(seen_query_ids) then
      raise exception 'Invalid prompt cohort' using errcode = '22023';
    end if;
    seen_query_ids := array_append(seen_query_ids, prompt_entry ->> 'queryId');

    for evidence_ref in
      select value from jsonb_array_elements(prompt_entry -> 'evidenceRefs')
    loop
      if jsonb_typeof(evidence_ref) <> 'object'
         or not (evidence_ref ?& array['field', 'valueIndex', 'evidenceIndexes'])
         or (select count(*) from jsonb_object_keys(evidence_ref)) <> 3
         or jsonb_typeof(evidence_ref -> 'field') <> 'string'
         or evidence_ref ->> 'field' not in (
           'companyName',
           'productName',
           'shortDescription',
           'primaryProduct',
           'targetAudience',
           'industry',
           'keyUseCases',
           'capabilities',
           'geography'
         )
         or jsonb_typeof(evidence_ref -> 'valueIndex') <> 'number'
         or char_length(evidence_ref ->> 'valueIndex') not between 1 and 3
         or evidence_ref ->> 'valueIndex' !~ '^(0|[1-9][0-9]*)$'
         or jsonb_typeof(evidence_ref -> 'evidenceIndexes') <> 'array'
         or jsonb_array_length(evidence_ref -> 'evidenceIndexes') < 1
         or jsonb_array_length(evidence_ref -> 'evidenceIndexes') > 200 then
        raise exception 'Invalid prompt evidence reference' using errcode = '22023';
      end if;

      value_index := (evidence_ref ->> 'valueIndex')::integer;
      if value_index > 199 then
        raise exception 'Invalid prompt evidence reference' using errcode = '22023';
      end if;

      profile_field := p_profile -> 'fields' -> (evidence_ref ->> 'field');
      if profile_field is null
         or profile_field ->> 'status' is distinct from 'confirmed'
         or jsonb_typeof(profile_field -> 'values') <> 'array'
         or value_index >= jsonb_array_length(profile_field -> 'values') then
        raise exception 'Invalid prompt evidence reference' using errcode = '22023';
      end if;

      profile_value := profile_field -> 'values' -> value_index;
      if jsonb_typeof(profile_value -> 'evidence') <> 'array' then
        raise exception 'Invalid prompt evidence reference' using errcode = '22023';
      end if;

      seen_evidence_indexes := array[]::integer[];
      for evidence_index_value in
        select value from jsonb_array_elements(evidence_ref -> 'evidenceIndexes')
      loop
        if jsonb_typeof(evidence_index_value) <> 'number'
           or char_length(evidence_index_value #>> '{}') not between 1 and 3
           or evidence_index_value #>> '{}' !~ '^(0|[1-9][0-9]*)$' then
          raise exception 'Invalid prompt evidence reference' using errcode = '22023';
        end if;

        evidence_index := (evidence_index_value #>> '{}')::integer;
        if evidence_index > 199
           or evidence_index >= jsonb_array_length(profile_value -> 'evidence')
           or evidence_index = any(seen_evidence_indexes) then
          raise exception 'Invalid prompt evidence reference' using errcode = '22023';
        end if;
        seen_evidence_indexes := array_append(seen_evidence_indexes, evidence_index);
      end loop;
    end loop;
  end loop;

  request_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'projectId', p_project_id::text,
          'profileSnapshotId', p_profile_snapshot_id::text,
          'promptMethodVersion', 'niche-prompts-v1',
          'profileMethodVersion', 'company-profile-v2',
          'language', 'en',
          'locale', null,
          'prompts', p_prompts
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  cohort_id := null;
  insert into public.prompt_cohorts (
    workspace_id,
    project_id,
    profile_snapshot_id,
    idempotency_key,
    request_fingerprint,
    prompt_method_version,
    profile_method_version,
    language,
    locale,
    query_count
  ) values (
    p_workspace_id,
    p_project_id,
    p_profile_snapshot_id,
    p_idempotency_key,
    request_fingerprint,
    'niche-prompts-v1',
    'company-profile-v2',
    'en',
    null,
    prompt_count
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into cohort_id;

  inserted := cohort_id is not null;
  if inserted then
    insert into public.prompt_cohort_queries (
      workspace_id,
      project_id,
      cohort_id,
      query_ordinal,
      query_id,
      category,
      template_version,
      query_text,
      language,
      locale,
      state,
      evidence_refs
    )
    select
      p_workspace_id,
      p_project_id,
      cohort_id,
      (entry.ordinality - 1)::smallint,
      entry.prompt ->> 'queryId',
      entry.prompt ->> 'category',
      entry.prompt ->> 'templateVersion',
      entry.prompt ->> 'text',
      'en',
      null,
      'planned',
      entry.prompt -> 'evidenceRefs'
    from jsonb_array_elements(p_prompts) with ordinality
      as entry(prompt, ordinality);
  else
    select *
    into existing
    from public.prompt_cohorts cohort
    where cohort.workspace_id = p_workspace_id
      and cohort.idempotency_key = p_idempotency_key
    for share;

    if not found then
      raise exception 'Prompt cohort replay missing' using errcode = 'P0001';
    end if;

    if existing.project_id is distinct from p_project_id
       or existing.profile_snapshot_id is distinct from p_profile_snapshot_id
       or existing.request_fingerprint is distinct from request_fingerprint
       or existing.prompt_method_version is distinct from 'niche-prompts-v1'
       or existing.profile_method_version is distinct from 'company-profile-v2'
       or existing.language is distinct from 'en'
       or existing.locale is not null
       or existing.query_count is distinct from prompt_count then
      raise exception 'Idempotency key reused with different prompt cohort'
        using errcode = '22023';
    end if;

    cohort_id := existing.id;
  end if;

  return jsonb_build_object(
    'cohortId', cohort_id,
    'profileSnapshotId', p_profile_snapshot_id,
    'requestFingerprint', request_fingerprint,
    'queryCount', prompt_count,
    'replayed', not inserted
  );
end;
$$;
revoke all on function app_private.persist_prompt_cohort(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) from public, anon, authenticated, service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.persist_prompt_cohort(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) to service_role;

create function public.persist_prompt_cohort(
  p_workspace_id uuid,
  p_project_id uuid,
  p_profile_snapshot_id uuid,
  p_idempotency_key uuid,
  p_profile jsonb,
  p_prompts jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.persist_prompt_cohort(
    p_workspace_id,
    p_project_id,
    p_profile_snapshot_id,
    p_idempotency_key,
    p_profile,
    p_prompts
  );
$$;
revoke all on function public.persist_prompt_cohort(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.persist_prompt_cohort(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) to service_role;

revoke execute on function public.reserve_scan(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function app_private.reserve_scan(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;

create function app_private.reserve_scan_from_cohort(
  p_workspace_id uuid,
  p_project_id uuid,
  p_idempotency_key uuid,
  p_prompt_cohort_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  cohort public.prompt_cohorts%rowtype;
  reservation jsonb;
  scan_queries jsonb;
  new_scan_id uuid;
  existing_mapping public.scan_prompt_cohorts%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_workspace_id is null
     or p_project_id is null
     or p_idempotency_key is null
     or p_prompt_cohort_id is null then
    raise exception 'Invalid scan request' using errcode = '22023';
  end if;

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
  into cohort
  from public.prompt_cohorts stored
  where stored.workspace_id = p_workspace_id
    and stored.project_id = p_project_id
    and stored.id = p_prompt_cohort_id
  for share;
  if not found then
    raise exception 'Prompt cohort access required' using errcode = '42501';
  end if;

  if cohort.query_count = 0 then
    raise exception 'Prompt cohort has no executable queries' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'queryId', query.query_id,
        'queryVersion', query.template_version,
        'queryText', query.query_text
      ) order by query.query_ordinal
    ),
    '[]'::jsonb
  )
  into scan_queries
  from public.prompt_cohort_queries query
  where query.workspace_id = p_workspace_id
    and query.project_id = p_project_id
    and query.cohort_id = p_prompt_cohort_id;

  if jsonb_array_length(scan_queries) <> cohort.query_count then
    raise exception 'Prompt cohort query snapshot incomplete' using errcode = 'P0001';
  end if;

  reservation := app_private.reserve_scan(
    p_workspace_id,
    p_project_id,
    p_idempotency_key,
    cohort.prompt_method_version,
    cohort.profile_method_version,
    scan_queries
  );
  new_scan_id := (reservation ->> 'scanId')::uuid;

  select *
  into existing_mapping
  from public.scan_prompt_cohorts mapping
  where mapping.workspace_id = p_workspace_id
    and mapping.scan_id = new_scan_id
  for share;

  if found then
    if existing_mapping.project_id is distinct from p_project_id
       or existing_mapping.prompt_cohort_id is distinct from p_prompt_cohort_id then
      raise exception 'Idempotency key reused with different scan prompt cohort'
        using errcode = '22023';
    end if;
  else
    if reservation ->> 'replayed' = 'true' then
      raise exception 'Existing scan lacks prompt cohort provenance' using errcode = 'P0001';
    end if;

    insert into public.scan_prompt_cohorts (
      workspace_id,
      project_id,
      scan_id,
      prompt_cohort_id
    ) values (
      p_workspace_id,
      p_project_id,
      new_scan_id,
      p_prompt_cohort_id
    );
  end if;

  return reservation || jsonb_build_object('promptCohortId', p_prompt_cohort_id);
end;
$$;
revoke all on function app_private.reserve_scan_from_cohort(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant usage on schema app_private to authenticated;
grant execute on function app_private.reserve_scan_from_cohort(uuid, uuid, uuid, uuid)
  to authenticated;

create function public.reserve_scan_from_cohort(
  p_workspace_id uuid,
  p_project_id uuid,
  p_idempotency_key uuid,
  p_prompt_cohort_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.reserve_scan_from_cohort(
    p_workspace_id,
    p_project_id,
    p_idempotency_key,
    p_prompt_cohort_id
  );
$$;
revoke all on function public.reserve_scan_from_cohort(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_scan_from_cohort(uuid, uuid, uuid, uuid)
  to authenticated;
