create table public.mention_detection_runs (
  workspace_id uuid not null,
  project_id uuid not null,
  observation_id uuid not null,
  catalog_id uuid not null,
  method_version text not null check (method_version = 'mention-detection-v1'),
  alias_method_version text not null check (alias_method_version = 'entity-alias-v1'),
  request_fingerprint text not null check (
    char_length(request_fingerprint) = 64
    and request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  answer_utf16_length integer not null check (
    answer_utf16_length between 0 and 200000
  ),
  occurrence_count smallint not null check (occurrence_count between 0 and 2000),
  mention_count smallint not null check (mention_count between 0 and 2000),
  ambiguous_count smallint not null check (ambiguous_count between 0 and 2000),
  created_at timestamptz not null default now(),
  primary key (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version
  ),
  foreign key (workspace_id, observation_id)
    references public.raw_observations (workspace_id, observation_id)
    on delete cascade,
  foreign key (workspace_id, project_id, catalog_id)
    references public.entity_alias_catalogs (workspace_id, project_id, catalog_id)
    on delete cascade,
  check (mention_count + ambiguous_count = occurrence_count)
);
create index mention_detection_runs_observation_idx
  on public.mention_detection_runs (workspace_id, observation_id);
create index mention_detection_runs_catalog_idx
  on public.mention_detection_runs (workspace_id, project_id, catalog_id);

create table public.mention_detection_occurrences (
  workspace_id uuid not null,
  project_id uuid not null,
  observation_id uuid not null,
  catalog_id uuid not null,
  method_version text not null check (method_version = 'mention-detection-v1'),
  occurrence_ordinal smallint not null check (
    occurrence_ordinal between 0 and 1999
  ),
  state text not null check (state in ('mention', 'ambiguous')),
  start_utf16 integer not null check (start_utf16 between 0 and 200000),
  end_utf16 integer not null check (end_utf16 between 1 and 200000),
  source_text text not null check (
    char_length(source_text) >= 1
    and octet_length(source_text) <= 2097152
  ),
  normalized_alias text not null check (
    normalized_alias = btrim(normalized_alias)
    and char_length(normalized_alias) between 1 and 120
  ),
  entity_id uuid,
  entity_kind text check (entity_kind is null or entity_kind in ('company', 'product')),
  alias_id uuid,
  alias_text text check (
    alias_text is null or char_length(alias_text) between 1 and 120
  ),
  created_at timestamptz not null default now(),
  primary key (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version,
    occurrence_ordinal
  ),
  foreign key (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version
  ) references public.mention_detection_runs (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version
  ) on delete cascade,
  check (end_utf16 > start_utf16),
  check (
    (state = 'mention'
      and entity_id is not null
      and entity_kind is not null
      and alias_id is not null
      and alias_text is not null)
    or (state = 'ambiguous'
      and entity_id is null
      and entity_kind is null
      and alias_id is null
      and alias_text is null)
  )
);

create table public.mention_detection_ambiguous_candidates (
  workspace_id uuid not null,
  project_id uuid not null,
  observation_id uuid not null,
  catalog_id uuid not null,
  method_version text not null check (method_version = 'mention-detection-v1'),
  occurrence_ordinal smallint not null check (
    occurrence_ordinal between 0 and 1999
  ),
  candidate_ordinal smallint not null check (candidate_ordinal between 0 and 49),
  entity_id uuid not null,
  entity_kind text not null check (entity_kind in ('company', 'product')),
  alias_id uuid not null,
  alias_text text not null check (char_length(alias_text) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version,
    occurrence_ordinal,
    candidate_ordinal
  ),
  foreign key (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version,
    occurrence_ordinal
  ) references public.mention_detection_occurrences (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version,
    occurrence_ordinal
  ) on delete cascade
);

create function app_private.prevent_mention_detection_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Mention detection evidence is immutable' using errcode = '22023';
end;
$$;
revoke all on function app_private.prevent_mention_detection_update()
  from public, anon, authenticated, service_role;

create trigger mention_detection_runs_no_update
  before update on public.mention_detection_runs
  for each row execute function app_private.prevent_mention_detection_update();
create trigger mention_detection_occurrences_no_update
  before update on public.mention_detection_occurrences
  for each row execute function app_private.prevent_mention_detection_update();
create trigger mention_detection_candidates_no_update
  before update on public.mention_detection_ambiguous_candidates
  for each row execute function app_private.prevent_mention_detection_update();

alter table public.mention_detection_runs enable row level security;
alter table public.mention_detection_occurrences enable row level security;
alter table public.mention_detection_ambiguous_candidates enable row level security;

revoke all on
  public.mention_detection_runs,
  public.mention_detection_occurrences,
  public.mention_detection_ambiguous_candidates
from public, anon, authenticated, service_role;
grant select on
  public.mention_detection_runs,
  public.mention_detection_occurrences,
  public.mention_detection_ambiguous_candidates
  to authenticated;

create policy mention_detection_runs_select_member
  on public.mention_detection_runs
  for select to authenticated using (exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = mention_detection_runs.workspace_id
      and membership.user_id = (select auth.uid())
  ));
create policy mention_detection_occurrences_select_member
  on public.mention_detection_occurrences
  for select to authenticated using (exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = mention_detection_occurrences.workspace_id
      and membership.user_id = (select auth.uid())
  ));
create policy mention_detection_candidates_select_member
  on public.mention_detection_ambiguous_candidates
  for select to authenticated using (exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = mention_detection_ambiguous_candidates.workspace_id
      and membership.user_id = (select auth.uid())
  ));

create function app_private.read_mention_detection_input(
  p_workspace_id uuid,
  p_observation_id uuid,
  p_catalog_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_id uuid;
  answer_text_value text;
  catalog_value jsonb;
begin
  if p_workspace_id is null
     or p_observation_id is null
     or p_catalog_id is null then
    raise exception 'Invalid mention detection read request' using errcode = '22023';
  end if;

  select
    observation.project_id,
    observation.answer_text,
    jsonb_build_object(
      'catalogId', catalog.catalog_id,
      'methodVersion', catalog.method_version,
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
  into project_id, answer_text_value, catalog_value
  from public.raw_observations observation
  join public.entity_alias_catalogs catalog
    on catalog.workspace_id = observation.workspace_id
   and catalog.project_id = observation.project_id
   and catalog.catalog_id = p_catalog_id
  where observation.workspace_id = p_workspace_id
    and observation.observation_id = p_observation_id;

  if not found then
    raise exception 'Mention detection input not found' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'projectId', project_id,
    'observationId', p_observation_id,
    'answerText', answer_text_value,
    'catalog', catalog_value
  );
end;
$$;
revoke all on function app_private.read_mention_detection_input(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.read_mention_detection_input(uuid, uuid, uuid)
  to service_role;

create function public.read_mention_detection_input(
  p_workspace_id uuid,
  p_observation_id uuid,
  p_catalog_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.read_mention_detection_input(
    p_workspace_id,
    p_observation_id,
    p_catalog_id
  );
$$;
revoke all on function public.read_mention_detection_input(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_mention_detection_input(uuid, uuid, uuid)
  to service_role;

create function app_private.persist_mention_detection(
  p_workspace_id uuid,
  p_observation_id uuid,
  p_catalog_id uuid,
  p_detection jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_project_id uuid;
  answer_text_value text;
  occurrence_count integer;
  mention_count integer;
  ambiguous_count integer;
  answer_utf16_length integer;
  request_fingerprint text;
  inserted_fingerprint text;
  existing_fingerprint text;
  existing_occurrence_count integer;
  existing_mention_count integer;
  existing_ambiguous_count integer;
  occurrence_value jsonb;
  occurrence_ordinal integer;
  state_value text;
  normalized_alias_value text;
  source_value jsonb;
  start_utf16_value integer;
  end_utf16_value integer;
  source_text_value text;
  previous_end integer := -1;
  entity_id_value uuid;
  entity_kind_value text;
  alias_id_value uuid;
  alias_text_value text;
  candidates_value jsonb;
  expected_candidates jsonb;
  expected_candidate_count integer;
  candidate_value jsonb;
  candidate_ordinal integer;
begin
  if p_workspace_id is null
     or p_observation_id is null
     or p_catalog_id is null
     or p_detection is null
     or not app_private.jsonb_has_exact_keys(
       p_detection,
       array[
         'methodVersion',
         'aliasMethodVersion',
         'catalogId',
         'answerUtf16Length',
         'occurrences'
       ]
     )
     or p_detection ->> 'methodVersion' <> 'mention-detection-v1'
     or p_detection ->> 'aliasMethodVersion' <> 'entity-alias-v1'
     or p_detection ->> 'catalogId' <> p_catalog_id::text
     or jsonb_typeof(p_detection -> 'answerUtf16Length') <> 'number'
     or (p_detection ->> 'answerUtf16Length') !~ '^[0-9]+$'
     or jsonb_typeof(p_detection -> 'occurrences') <> 'array'
     or jsonb_array_length(p_detection -> 'occurrences') > 2000 then
    raise exception 'Invalid mention detection payload' using errcode = '22023';
  end if;

  answer_utf16_length := (p_detection ->> 'answerUtf16Length')::integer;
  if answer_utf16_length < 0 or answer_utf16_length > 200000 then
    raise exception 'Invalid mention detection payload' using errcode = '22023';
  end if;

  select observation.project_id, observation.answer_text
    into resolved_project_id, answer_text_value
  from public.raw_observations observation
  join public.entity_alias_catalogs catalog
    on catalog.workspace_id = observation.workspace_id
   and catalog.project_id = observation.project_id
   and catalog.catalog_id = p_catalog_id
  where observation.workspace_id = p_workspace_id
    and observation.observation_id = p_observation_id;
  if not found then
    raise exception 'Mention detection input not found' using errcode = 'P0001';
  end if;
  if answer_text_value is null then
    raise exception 'Mention detection answer unavailable' using errcode = 'P0001';
  end if;

  occurrence_count := jsonb_array_length(p_detection -> 'occurrences');
  select
    count(*) filter (where value ->> 'state' = 'mention'),
    count(*) filter (where value ->> 'state' = 'ambiguous')
  into mention_count, ambiguous_count
  from jsonb_array_elements(p_detection -> 'occurrences');
  if mention_count + ambiguous_count <> occurrence_count then
    raise exception 'Invalid mention detection payload' using errcode = '22023';
  end if;

  request_fingerprint := encode(
    extensions.digest(convert_to(p_detection::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.mention_detection_runs (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version,
    alias_method_version,
    request_fingerprint,
    answer_utf16_length,
    occurrence_count,
    mention_count,
    ambiguous_count
  ) values (
    p_workspace_id,
    resolved_project_id,
    p_observation_id,
    p_catalog_id,
    'mention-detection-v1',
    'entity-alias-v1',
    request_fingerprint,
    answer_utf16_length,
    occurrence_count,
    mention_count,
    ambiguous_count
  )
  on conflict (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version
  ) do nothing
  returning request_fingerprint into inserted_fingerprint;

  if inserted_fingerprint is null then
    select
      run.request_fingerprint,
      run.occurrence_count,
      run.mention_count,
      run.ambiguous_count
    into
      existing_fingerprint,
      existing_occurrence_count,
      existing_mention_count,
      existing_ambiguous_count
    from public.mention_detection_runs run
    where run.workspace_id = p_workspace_id
      and run.project_id = resolved_project_id
      and run.observation_id = p_observation_id
      and run.catalog_id = p_catalog_id
      and run.method_version = 'mention-detection-v1'
    for update;

    if existing_fingerprint is distinct from request_fingerprint then
      raise exception 'Mention detection replay conflicts with stored evidence'
        using errcode = '22023';
    end if;

    return jsonb_build_object(
      'observationId', p_observation_id,
      'catalogId', p_catalog_id,
      'methodVersion', 'mention-detection-v1',
      'occurrenceCount', existing_occurrence_count,
      'mentionCount', existing_mention_count,
      'ambiguousCount', existing_ambiguous_count,
      'replayed', true
    );
  end if;

  for occurrence_value, occurrence_ordinal in
    select value, ordinality - 1
    from jsonb_array_elements(p_detection -> 'occurrences') with ordinality
  loop
    state_value := occurrence_value ->> 'state';
    if jsonb_typeof(occurrence_value -> 'occurrenceOrdinal') <> 'number'
       or (occurrence_value ->> 'occurrenceOrdinal') !~ '^[0-9]+$'
       or (occurrence_value ->> 'occurrenceOrdinal')::integer <> occurrence_ordinal
       or occurrence_ordinal > 1999
       or jsonb_typeof(occurrence_value -> 'normalizedAlias') <> 'string' then
      raise exception 'Invalid mention detection occurrence' using errcode = '22023';
    end if;

    normalized_alias_value := occurrence_value ->> 'normalizedAlias';
    if normalized_alias_value <> btrim(normalized_alias_value)
       or char_length(normalized_alias_value) not between 1 and 120 then
      raise exception 'Invalid mention detection occurrence' using errcode = '22023';
    end if;

    source_value := occurrence_value -> 'source';
    if source_value is null
       or not app_private.jsonb_has_exact_keys(
         source_value,
         array['startUtf16', 'endUtf16', 'text']
       )
       or jsonb_typeof(source_value -> 'startUtf16') <> 'number'
       or jsonb_typeof(source_value -> 'endUtf16') <> 'number'
       or (source_value ->> 'startUtf16') !~ '^[0-9]+$'
       or (source_value ->> 'endUtf16') !~ '^[0-9]+$'
       or jsonb_typeof(source_value -> 'text') <> 'string' then
      raise exception 'Invalid mention detection occurrence' using errcode = '22023';
    end if;

    start_utf16_value := (source_value ->> 'startUtf16')::integer;
    end_utf16_value := (source_value ->> 'endUtf16')::integer;
    source_text_value := source_value ->> 'text';
    if start_utf16_value < 0
       or end_utf16_value <= start_utf16_value
       or end_utf16_value > answer_utf16_length
       or start_utf16_value < previous_end
       or char_length(source_text_value) < 1
       or octet_length(source_text_value) > 2097152 then
      raise exception 'Invalid mention detection occurrence' using errcode = '22023';
    end if;
    previous_end := end_utf16_value;

    if state_value = 'mention' then
      if not app_private.jsonb_has_exact_keys(
        occurrence_value,
        array[
          'occurrenceOrdinal',
          'state',
          'entityId',
          'entityKind',
          'aliasId',
          'aliasText',
          'normalizedAlias',
          'source'
        ]
      )
         or jsonb_typeof(occurrence_value -> 'entityId') <> 'string'
         or (occurrence_value ->> 'entityId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or occurrence_value ->> 'entityKind' not in ('company', 'product')
         or jsonb_typeof(occurrence_value -> 'aliasId') <> 'string'
         or (occurrence_value ->> 'aliasId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or jsonb_typeof(occurrence_value -> 'aliasText') <> 'string' then
        raise exception 'Invalid mention detection occurrence' using errcode = '22023';
      end if;

      entity_id_value := (occurrence_value ->> 'entityId')::uuid;
      entity_kind_value := occurrence_value ->> 'entityKind';
      alias_id_value := (occurrence_value ->> 'aliasId')::uuid;
      alias_text_value := occurrence_value ->> 'aliasText';

      perform 1
      from public.entity_alias_entities entity
      join public.entity_alias_entries alias
        on alias.workspace_id = entity.workspace_id
       and alias.project_id = entity.project_id
       and alias.catalog_id = entity.catalog_id
       and alias.entity_ordinal = entity.entity_ordinal
      where entity.workspace_id = p_workspace_id
        and entity.project_id = resolved_project_id
        and entity.catalog_id = p_catalog_id
        and entity.entity_id = entity_id_value
        and entity.entity_kind = entity_kind_value
        and alias.alias_id = alias_id_value
        and alias.alias_text = alias_text_value
        and alias.normalized_alias = normalized_alias_value
        and alias.match_state = 'eligible';
      if not found then
        raise exception 'Mention detection occurrence does not match alias catalog'
          using errcode = '22023';
      end if;

      insert into public.mention_detection_occurrences (
        workspace_id,
        project_id,
        observation_id,
        catalog_id,
        method_version,
        occurrence_ordinal,
        state,
        start_utf16,
        end_utf16,
        source_text,
        normalized_alias,
        entity_id,
        entity_kind,
        alias_id,
        alias_text
      ) values (
        p_workspace_id,
        resolved_project_id,
        p_observation_id,
        p_catalog_id,
        'mention-detection-v1',
        occurrence_ordinal,
        'mention',
        start_utf16_value,
        end_utf16_value,
        source_text_value,
        normalized_alias_value,
        entity_id_value,
        entity_kind_value,
        alias_id_value,
        alias_text_value
      );
    elsif state_value = 'ambiguous' then
      if not app_private.jsonb_has_exact_keys(
        occurrence_value,
        array[
          'occurrenceOrdinal',
          'state',
          'normalizedAlias',
          'candidates',
          'source'
        ]
      )
         or jsonb_typeof(occurrence_value -> 'candidates') <> 'array'
         or jsonb_array_length(occurrence_value -> 'candidates') not between 2 and 50 then
        raise exception 'Invalid mention detection occurrence' using errcode = '22023';
      end if;

      candidates_value := occurrence_value -> 'candidates';
      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'entityId', entity.entity_id,
              'entityKind', entity.entity_kind,
              'aliasId', alias.alias_id,
              'aliasText', alias.alias_text
            ) order by entity.entity_ordinal, alias.alias_ordinal
          ),
          '[]'::jsonb
        ),
        count(*)
      into expected_candidates, expected_candidate_count
      from public.entity_alias_entities entity
      join public.entity_alias_entries alias
        on alias.workspace_id = entity.workspace_id
       and alias.project_id = entity.project_id
       and alias.catalog_id = entity.catalog_id
       and alias.entity_ordinal = entity.entity_ordinal
      where entity.workspace_id = p_workspace_id
        and entity.project_id = resolved_project_id
        and entity.catalog_id = p_catalog_id
        and alias.normalized_alias = normalized_alias_value
        and alias.match_state = 'ambiguous';

      if expected_candidate_count < 2
         or candidates_value is distinct from expected_candidates then
        raise exception 'Mention detection ambiguity does not match alias catalog'
          using errcode = '22023';
      end if;

      insert into public.mention_detection_occurrences (
        workspace_id,
        project_id,
        observation_id,
        catalog_id,
        method_version,
        occurrence_ordinal,
        state,
        start_utf16,
        end_utf16,
        source_text,
        normalized_alias
      ) values (
        p_workspace_id,
        resolved_project_id,
        p_observation_id,
        p_catalog_id,
        'mention-detection-v1',
        occurrence_ordinal,
        'ambiguous',
        start_utf16_value,
        end_utf16_value,
        source_text_value,
        normalized_alias_value
      );

      for candidate_value, candidate_ordinal in
        select value, ordinality - 1
        from jsonb_array_elements(candidates_value) with ordinality
      loop
        insert into public.mention_detection_ambiguous_candidates (
          workspace_id,
          project_id,
          observation_id,
          catalog_id,
          method_version,
          occurrence_ordinal,
          candidate_ordinal,
          entity_id,
          entity_kind,
          alias_id,
          alias_text
        ) values (
          p_workspace_id,
          resolved_project_id,
          p_observation_id,
          p_catalog_id,
          'mention-detection-v1',
          occurrence_ordinal,
          candidate_ordinal,
          (candidate_value ->> 'entityId')::uuid,
          candidate_value ->> 'entityKind',
          (candidate_value ->> 'aliasId')::uuid,
          candidate_value ->> 'aliasText'
        );
      end loop;
    else
      raise exception 'Invalid mention detection occurrence' using errcode = '22023';
    end if;
  end loop;

  return jsonb_build_object(
    'observationId', p_observation_id,
    'catalogId', p_catalog_id,
    'methodVersion', 'mention-detection-v1',
    'occurrenceCount', occurrence_count,
    'mentionCount', mention_count,
    'ambiguousCount', ambiguous_count,
    'replayed', false
  );
end;
$$;
revoke all on function app_private.persist_mention_detection(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function app_private.persist_mention_detection(uuid, uuid, uuid, jsonb)
  to service_role;

create function public.persist_mention_detection(
  p_workspace_id uuid,
  p_observation_id uuid,
  p_catalog_id uuid,
  p_detection jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.persist_mention_detection(
    p_workspace_id,
    p_observation_id,
    p_catalog_id,
    p_detection
  );
$$;
revoke all on function public.persist_mention_detection(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.persist_mention_detection(uuid, uuid, uuid, jsonb)
  to service_role;
