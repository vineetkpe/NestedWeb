create table public.entity_alias_catalogs (
  workspace_id uuid not null,
  project_id uuid not null,
  catalog_id uuid not null default gen_random_uuid(),
  idempotency_key uuid not null,
  method_version text not null check (method_version = 'entity-alias-v1'),
  request_fingerprint text not null check (
    char_length(request_fingerprint) = 64
    and request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  entity_count smallint not null check (entity_count between 1 and 50),
  alias_count smallint not null check (alias_count between 1 and 200),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (workspace_id, project_id, catalog_id),
  unique (workspace_id, project_id, idempotency_key),
  foreign key (workspace_id, project_id)
    references public.projects (workspace_id, id) on delete cascade
);

create table public.entity_alias_entities (
  workspace_id uuid not null,
  project_id uuid not null,
  catalog_id uuid not null,
  entity_ordinal smallint not null check (entity_ordinal between 0 and 49),
  entity_id uuid not null default gen_random_uuid(),
  entity_kind text not null check (entity_kind in ('company', 'product')),
  canonical_name text not null check (
    canonical_name = btrim(canonical_name)
    and char_length(canonical_name) between 1 and 120
  ),
  primary key (workspace_id, project_id, catalog_id, entity_ordinal),
  unique (workspace_id, project_id, catalog_id, entity_id),
  foreign key (workspace_id, project_id, catalog_id)
    references public.entity_alias_catalogs (workspace_id, project_id, catalog_id)
    on delete cascade
);
create unique index entity_alias_entities_one_company_idx
  on public.entity_alias_entities (workspace_id, project_id, catalog_id)
  where entity_kind = 'company';

create table public.entity_alias_entries (
  workspace_id uuid not null,
  project_id uuid not null,
  catalog_id uuid not null,
  entity_ordinal smallint not null,
  alias_ordinal smallint not null check (alias_ordinal between 0 and 19),
  alias_id uuid not null default gen_random_uuid(),
  method_version text not null check (method_version = 'entity-alias-v1'),
  alias_text text not null check (char_length(alias_text) between 1 and 120),
  normalized_alias text not null check (
    char_length(normalized_alias) between 1 and 120
    and normalized_alias = btrim(normalized_alias)
  ),
  match_state text not null check (match_state in ('eligible', 'ambiguous')),
  primary key (
    workspace_id, project_id, catalog_id, entity_ordinal, alias_ordinal
  ),
  unique (workspace_id, project_id, catalog_id, alias_id),
  foreign key (workspace_id, project_id, catalog_id, entity_ordinal)
    references public.entity_alias_entities (
      workspace_id, project_id, catalog_id, entity_ordinal
    ) on delete cascade
);
create index entity_alias_entries_normalized_idx
  on public.entity_alias_entries (
    workspace_id, project_id, catalog_id, normalized_alias
  );

create function app_private.prevent_entity_alias_snapshot_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Entity alias snapshots are immutable' using errcode = '22023';
end;
$$;
revoke all on function app_private.prevent_entity_alias_snapshot_update()
  from public, anon, authenticated, service_role;

create trigger entity_alias_catalogs_no_update
  before update on public.entity_alias_catalogs
  for each row execute function app_private.prevent_entity_alias_snapshot_update();
create trigger entity_alias_entities_no_update
  before update on public.entity_alias_entities
  for each row execute function app_private.prevent_entity_alias_snapshot_update();
create trigger entity_alias_entries_no_update
  before update on public.entity_alias_entries
  for each row execute function app_private.prevent_entity_alias_snapshot_update();

alter table public.entity_alias_catalogs enable row level security;
alter table public.entity_alias_entities enable row level security;
alter table public.entity_alias_entries enable row level security;

revoke all on
  public.entity_alias_catalogs,
  public.entity_alias_entities,
  public.entity_alias_entries
from public, anon, authenticated, service_role;
grant select on
  public.entity_alias_catalogs,
  public.entity_alias_entities,
  public.entity_alias_entries
  to authenticated;

create policy entity_alias_catalogs_select_member
  on public.entity_alias_catalogs
  for select to authenticated using (exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = entity_alias_catalogs.workspace_id
      and membership.user_id = (select auth.uid())
  ));
create policy entity_alias_entities_select_member
  on public.entity_alias_entities
  for select to authenticated using (exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = entity_alias_entities.workspace_id
      and membership.user_id = (select auth.uid())
  ));
create policy entity_alias_entries_select_member
  on public.entity_alias_entries
  for select to authenticated using (exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = entity_alias_entries.workspace_id
      and membership.user_id = (select auth.uid())
  ));

create function app_private.jsonb_has_exact_keys(
  p_value jsonb,
  p_expected text[]
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_typeof(p_value) = 'object'
    and (select count(*) from jsonb_object_keys(p_value)) = cardinality(p_expected)
    and not exists (
      select 1
      from jsonb_object_keys(p_value) key_name
      where not (key_name = any (p_expected))
    );
$$;
revoke all on function app_private.jsonb_has_exact_keys(jsonb, text[])
  from public, anon, authenticated, service_role;

create function app_private.normalize_entity_alias_v1(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  normalized_source text;
  normalized_alias text;
begin
  if p_value is null
     or char_length(p_value) not between 1 and 120
     or p_value ~ '[[:cntrl:]]' then
    return null;
  end if;

  normalized_source := normalize(p_value, NFKC);
  if normalized_source is null
     or normalized_source <> btrim(normalized_source) then
    return null;
  end if;

  normalized_alias := lower(
    regexp_replace(normalized_source, '[[:space:]]+', ' ', 'g')
  );
  if char_length(normalized_alias) not between 1 and 120
     or normalized_alias <> btrim(normalized_alias)
     or normalized_alias ~ '[[:cntrl:]]' then
    return null;
  end if;

  return normalized_alias;
end;
$$;
revoke all on function app_private.normalize_entity_alias_v1(text)
  from public, anon, authenticated, service_role;

create function app_private.entity_alias_catalog_result(
  p_workspace_id uuid,
  p_project_id uuid,
  p_catalog_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'catalogId', catalog.catalog_id,
    'methodVersion', catalog.method_version,
    'requestFingerprint', catalog.request_fingerprint,
    'entityCount', catalog.entity_count,
    'aliasCount', catalog.alias_count,
    'replayed', p_replayed,
    'entities', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entityId', entity.entity_id,
          'entityOrdinal', entity.entity_ordinal,
          'entityKind', entity.entity_kind,
          'canonicalName', entity.canonical_name,
          'aliases', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'aliasId', alias.alias_id,
                'aliasOrdinal', alias.alias_ordinal,
                'aliasText', alias.alias_text,
                'normalizedAlias', alias.normalized_alias,
                'matchState', alias.match_state
              ) order by alias.alias_ordinal
            )
            from public.entity_alias_entries alias
            where alias.workspace_id = entity.workspace_id
              and alias.project_id = entity.project_id
              and alias.catalog_id = entity.catalog_id
              and alias.entity_ordinal = entity.entity_ordinal
          ), '[]'::jsonb)
        ) order by entity.entity_ordinal
      )
      from public.entity_alias_entities entity
      where entity.workspace_id = catalog.workspace_id
        and entity.project_id = catalog.project_id
        and entity.catalog_id = catalog.catalog_id
    ), '[]'::jsonb)
  )
  from public.entity_alias_catalogs catalog
  where catalog.workspace_id = p_workspace_id
    and catalog.project_id = p_project_id
    and catalog.catalog_id = p_catalog_id;
$$;
revoke all on function app_private.entity_alias_catalog_result(uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

create function app_private.persist_entity_alias_catalog(
  p_workspace_id uuid,
  p_project_id uuid,
  p_idempotency_key uuid,
  p_catalog jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  entity_value jsonb;
  alias_value jsonb;
  entity_ordinal integer;
  alias_ordinal integer;
  entity_kind text;
  canonical_name text;
  alias_text text;
  supplied_normalized_alias text;
  computed_normalized_alias text;
  supplied_match_state text;
  expected_match_state text;
  company_count integer := 0;
  total_alias_count integer := 0;
  alias_owner_count integer;
  seen_normalized text[];
  request_fingerprint text;
  new_catalog_id uuid := gen_random_uuid();
  inserted_catalog_id uuid;
  existing_catalog_id uuid;
  existing_fingerprint text;
  new_entity_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_project_id is null or p_idempotency_key is null then
    raise exception 'Invalid entity alias catalog request' using errcode = '22023';
  end if;

  perform 1
  from public.projects project
  join public.workspace_memberships membership
    on membership.workspace_id = project.workspace_id
   and membership.user_id = actor_id
  where project.workspace_id = p_workspace_id
    and project.id = p_project_id;
  if not found then
    raise exception 'Project access denied' using errcode = '42501';
  end if;

  if not app_private.jsonb_has_exact_keys(
      p_catalog,
      array['methodVersion', 'entities']
    )
     or p_catalog ->> 'methodVersion' <> 'entity-alias-v1'
     or jsonb_typeof(p_catalog -> 'entities') <> 'array'
     or jsonb_array_length(p_catalog -> 'entities') not between 1 and 50 then
    raise exception 'Invalid entity alias catalog payload' using errcode = '22023';
  end if;

  for entity_value, entity_ordinal in
    select value, ordinality - 1
    from jsonb_array_elements(p_catalog -> 'entities') with ordinality
  loop
    if not app_private.jsonb_has_exact_keys(
        entity_value,
        array['entityKind', 'canonicalName', 'aliases']
      )
       or jsonb_typeof(entity_value -> 'entityKind') <> 'string'
       or jsonb_typeof(entity_value -> 'canonicalName') <> 'string'
       or jsonb_typeof(entity_value -> 'aliases') <> 'array'
       or jsonb_array_length(entity_value -> 'aliases') not between 1 and 20 then
      raise exception 'Invalid entity alias catalog payload' using errcode = '22023';
    end if;

    entity_kind := entity_value ->> 'entityKind';
    canonical_name := entity_value ->> 'canonicalName';
    if entity_kind not in ('company', 'product')
       or canonical_name <> btrim(canonical_name)
       or char_length(canonical_name) not between 1 and 120
       or canonical_name ~ '[[:cntrl:]]' then
      raise exception 'Invalid entity alias catalog payload' using errcode = '22023';
    end if;
    if entity_kind = 'company' then
      company_count := company_count + 1;
    end if;

    seen_normalized := array[]::text[];
    for alias_value, alias_ordinal in
      select value, ordinality - 1
      from jsonb_array_elements(entity_value -> 'aliases') with ordinality
    loop
      if not app_private.jsonb_has_exact_keys(
          alias_value,
          array['aliasText', 'normalizedAlias', 'matchState']
        )
         or jsonb_typeof(alias_value -> 'aliasText') <> 'string'
         or jsonb_typeof(alias_value -> 'normalizedAlias') <> 'string'
         or jsonb_typeof(alias_value -> 'matchState') <> 'string' then
        raise exception 'Invalid entity alias catalog payload' using errcode = '22023';
      end if;

      alias_text := alias_value ->> 'aliasText';
      supplied_normalized_alias := alias_value ->> 'normalizedAlias';
      supplied_match_state := alias_value ->> 'matchState';
      computed_normalized_alias := app_private.normalize_entity_alias_v1(alias_text);
      if computed_normalized_alias is null
         or supplied_normalized_alias is distinct from computed_normalized_alias
         or supplied_match_state not in ('eligible', 'ambiguous')
         or supplied_normalized_alias = any (seen_normalized) then
        raise exception 'Invalid entity alias catalog payload' using errcode = '22023';
      end if;

      seen_normalized := array_append(seen_normalized, supplied_normalized_alias);
      total_alias_count := total_alias_count + 1;
      if total_alias_count > 200 then
        raise exception 'Invalid entity alias catalog payload' using errcode = '22023';
      end if;
    end loop;
  end loop;

  if company_count <> 1 or total_alias_count < 1 then
    raise exception 'Invalid entity alias catalog payload' using errcode = '22023';
  end if;

  for entity_value, entity_ordinal in
    select value, ordinality - 1
    from jsonb_array_elements(p_catalog -> 'entities') with ordinality
  loop
    for alias_value, alias_ordinal in
      select value, ordinality - 1
      from jsonb_array_elements(entity_value -> 'aliases') with ordinality
    loop
      supplied_normalized_alias := alias_value ->> 'normalizedAlias';
      supplied_match_state := alias_value ->> 'matchState';
      select count(distinct entity_row.ordinality)
        into alias_owner_count
      from jsonb_array_elements(p_catalog -> 'entities') with ordinality
        as entity_row(value, ordinality)
      cross join lateral jsonb_array_elements(entity_row.value -> 'aliases')
        as alias_row(value)
      where alias_row.value ->> 'normalizedAlias' = supplied_normalized_alias;

      expected_match_state := case
        when alias_owner_count > 1 then 'ambiguous'
        else 'eligible'
      end;
      if supplied_match_state <> expected_match_state then
        raise exception 'Invalid entity alias catalog payload' using errcode = '22023';
      end if;
    end loop;
  end loop;

  request_fingerprint := encode(
    extensions.digest(convert_to(p_catalog::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.entity_alias_catalogs (
    workspace_id,
    project_id,
    catalog_id,
    idempotency_key,
    method_version,
    request_fingerprint,
    entity_count,
    alias_count,
    created_by
  ) values (
    p_workspace_id,
    p_project_id,
    new_catalog_id,
    p_idempotency_key,
    'entity-alias-v1',
    request_fingerprint,
    jsonb_array_length(p_catalog -> 'entities'),
    total_alias_count,
    actor_id
  )
  on conflict (workspace_id, project_id, idempotency_key) do nothing
  returning catalog_id into inserted_catalog_id;

  if inserted_catalog_id is null then
    select catalog.catalog_id, catalog.request_fingerprint
      into existing_catalog_id, existing_fingerprint
    from public.entity_alias_catalogs catalog
    where catalog.workspace_id = p_workspace_id
      and catalog.project_id = p_project_id
      and catalog.idempotency_key = p_idempotency_key
    for update;

    if not found then
      raise exception 'Entity alias catalog request missing' using errcode = 'P0001';
    end if;
    if existing_fingerprint <> request_fingerprint then
      raise exception 'Entity alias catalog idempotency conflict' using errcode = '22023';
    end if;
    return app_private.entity_alias_catalog_result(
      p_workspace_id,
      p_project_id,
      existing_catalog_id,
      true
    );
  end if;

  for entity_value, entity_ordinal in
    select value, ordinality - 1
    from jsonb_array_elements(p_catalog -> 'entities') with ordinality
  loop
    entity_kind := entity_value ->> 'entityKind';
    canonical_name := entity_value ->> 'canonicalName';
    new_entity_id := gen_random_uuid();

    insert into public.entity_alias_entities (
      workspace_id,
      project_id,
      catalog_id,
      entity_ordinal,
      entity_id,
      entity_kind,
      canonical_name
    ) values (
      p_workspace_id,
      p_project_id,
      new_catalog_id,
      entity_ordinal,
      new_entity_id,
      entity_kind,
      canonical_name
    );

    for alias_value, alias_ordinal in
      select value, ordinality - 1
      from jsonb_array_elements(entity_value -> 'aliases') with ordinality
    loop
      insert into public.entity_alias_entries (
        workspace_id,
        project_id,
        catalog_id,
        entity_ordinal,
        alias_ordinal,
        alias_id,
        method_version,
        alias_text,
        normalized_alias,
        match_state
      ) values (
        p_workspace_id,
        p_project_id,
        new_catalog_id,
        entity_ordinal,
        alias_ordinal,
        gen_random_uuid(),
        'entity-alias-v1',
        alias_value ->> 'aliasText',
        alias_value ->> 'normalizedAlias',
        alias_value ->> 'matchState'
      );
    end loop;
  end loop;

  return app_private.entity_alias_catalog_result(
    p_workspace_id,
    p_project_id,
    new_catalog_id,
    false
  );
end;
$$;
revoke all on function app_private.persist_entity_alias_catalog(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function app_private.persist_entity_alias_catalog(uuid, uuid, uuid, jsonb)
  to authenticated;

create function public.persist_entity_alias_catalog(
  p_workspace_id uuid,
  p_project_id uuid,
  p_idempotency_key uuid,
  p_catalog jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.persist_entity_alias_catalog(
    p_workspace_id,
    p_project_id,
    p_idempotency_key,
    p_catalog
  );
$$;
revoke all on function public.persist_entity_alias_catalog(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.persist_entity_alias_catalog(uuid, uuid, uuid, jsonb)
  to authenticated;
