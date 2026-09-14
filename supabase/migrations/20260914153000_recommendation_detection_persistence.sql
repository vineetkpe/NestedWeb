create table public.recommendation_detection_runs (
  workspace_id uuid not null,
  project_id uuid not null,
  observation_id uuid not null,
  catalog_id uuid not null,
  method_version text not null check (
    method_version = 'recommendation-detection-v1'
  ),
  mention_method_version text not null check (
    mention_method_version = 'mention-detection-v1'
  ),
  request_fingerprint text not null check (
    char_length(request_fingerprint) = 64
    and request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  result_count smallint not null check (result_count between 0 and 2000),
  recommended_count smallint not null check (recommended_count between 0 and 2000),
  not_recommended_count smallint not null check (
    not_recommended_count between 0 and 2000
  ),
  unknown_count smallint not null check (unknown_count between 0 and 2000),
  created_at timestamptz not null default now(),
  primary key (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version
  ),
  foreign key (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    mention_method_version
  ) references public.mention_detection_runs (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version
  ) on delete cascade,
  check (
    recommended_count + not_recommended_count + unknown_count = result_count
  )
);
create index recommendation_detection_runs_mention_fk_idx
  on public.recommendation_detection_runs (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    mention_method_version
  );

create table public.recommendation_detection_results (
  workspace_id uuid not null,
  project_id uuid not null,
  observation_id uuid not null,
  catalog_id uuid not null,
  method_version text not null check (
    method_version = 'recommendation-detection-v1'
  ),
  mention_method_version text not null check (
    mention_method_version = 'mention-detection-v1'
  ),
  occurrence_ordinal smallint not null check (
    occurrence_ordinal between 0 and 1999
  ),
  entity_id uuid not null,
  entity_kind text not null check (entity_kind in ('company', 'product')),
  alias_id uuid not null,
  state text not null check (
    state in ('recommended', 'not_recommended', 'unknown')
  ),
  evidence_start_utf16 integer check (
    evidence_start_utf16 is null
    or evidence_start_utf16 between 0 and 200000
  ),
  evidence_end_utf16 integer check (
    evidence_end_utf16 is null
    or evidence_end_utf16 between 1 and 200000
  ),
  evidence_text text check (
    evidence_text is null
    or (
      char_length(evidence_text) >= 1
      and octet_length(evidence_text) <= 2097152
    )
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
  ) references public.recommendation_detection_runs (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version
  ) on delete cascade,
  foreign key (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    mention_method_version,
    occurrence_ordinal
  ) references public.mention_detection_occurrences (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version,
    occurrence_ordinal
  ) on delete cascade,
  check (
    (state = 'unknown'
      and evidence_start_utf16 is null
      and evidence_end_utf16 is null
      and evidence_text is null)
    or (state in ('recommended', 'not_recommended')
      and evidence_start_utf16 is not null
      and evidence_end_utf16 is not null
      and evidence_text is not null
      and evidence_end_utf16 > evidence_start_utf16)
  )
);
create index recommendation_detection_results_mention_fk_idx
  on public.recommendation_detection_results (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    mention_method_version,
    occurrence_ordinal
  );

create function app_private.prevent_recommendation_detection_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Recommendation detection evidence is immutable'
    using errcode = '22023';
end;
$$;
revoke all on function app_private.prevent_recommendation_detection_update()
  from public, anon, authenticated, service_role;

create trigger recommendation_detection_runs_no_update
before update on public.recommendation_detection_runs
for each row execute function app_private.prevent_recommendation_detection_update();

create trigger recommendation_detection_results_no_update
before update on public.recommendation_detection_results
for each row execute function app_private.prevent_recommendation_detection_update();

alter table public.recommendation_detection_runs enable row level security;
alter table public.recommendation_detection_results enable row level security;

revoke all on
  public.recommendation_detection_runs,
  public.recommendation_detection_results
from public, anon, authenticated, service_role;
grant select on
  public.recommendation_detection_runs,
  public.recommendation_detection_results
  to authenticated;

create policy recommendation_detection_runs_select_member
on public.recommendation_detection_runs
for select to authenticated
using (exists (
  select 1
  from public.workspace_memberships membership
  where membership.workspace_id = recommendation_detection_runs.workspace_id
    and membership.user_id = (select auth.uid())
));

create policy recommendation_detection_results_select_member
on public.recommendation_detection_results
for select to authenticated
using (exists (
  select 1
  from public.workspace_memberships membership
  where membership.workspace_id = recommendation_detection_results.workspace_id
    and membership.user_id = (select auth.uid())
));

create function app_private.read_recommendation_detection_input(
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
  resolved_project_id uuid;
  answer_text_value text;
  mentions_value jsonb;
begin
  if p_workspace_id is null
     or p_observation_id is null
     or p_catalog_id is null then
    raise exception 'Invalid recommendation detection read request'
      using errcode = '22023';
  end if;

  select observation.project_id, observation.answer_text
  into resolved_project_id, answer_text_value
  from public.raw_observations observation
  join public.mention_detection_runs mention_run
    on mention_run.workspace_id = observation.workspace_id
   and mention_run.project_id = observation.project_id
   and mention_run.observation_id = observation.observation_id
   and mention_run.catalog_id = p_catalog_id
   and mention_run.method_version = 'mention-detection-v1'
  where observation.workspace_id = p_workspace_id
    and observation.observation_id = p_observation_id;

  if not found then
    raise exception 'Recommendation detection input not found'
      using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'occurrenceOrdinal', occurrence.occurrence_ordinal,
        'state', 'mention',
        'entityId', occurrence.entity_id,
        'entityKind', occurrence.entity_kind,
        'aliasId', occurrence.alias_id,
        'aliasText', occurrence.alias_text,
        'normalizedAlias', occurrence.normalized_alias,
        'source', jsonb_build_object(
          'startUtf16', occurrence.start_utf16,
          'endUtf16', occurrence.end_utf16,
          'text', occurrence.source_text
        )
      ) order by occurrence.occurrence_ordinal
    ),
    '[]'::jsonb
  )
  into mentions_value
  from public.mention_detection_occurrences occurrence
  where occurrence.workspace_id = p_workspace_id
    and occurrence.project_id = resolved_project_id
    and occurrence.observation_id = p_observation_id
    and occurrence.catalog_id = p_catalog_id
    and occurrence.method_version = 'mention-detection-v1'
    and occurrence.state = 'mention';

  if jsonb_array_length(mentions_value) > 2000 then
    raise exception 'Recommendation mention count invariant violated'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'projectId', resolved_project_id,
    'observationId', p_observation_id,
    'catalogId', p_catalog_id,
    'answerText', answer_text_value,
    'mentions', mentions_value
  );
end;
$$;
revoke all on function app_private.read_recommendation_detection_input(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.read_recommendation_detection_input(uuid, uuid, uuid)
  to service_role;

create function public.read_recommendation_detection_input(
  p_workspace_id uuid,
  p_observation_id uuid,
  p_catalog_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.read_recommendation_detection_input(
    p_workspace_id,
    p_observation_id,
    p_catalog_id
  );
$$;
revoke all on function public.read_recommendation_detection_input(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_recommendation_detection_input(uuid, uuid, uuid)
  to service_role;

create function app_private.persist_recommendation_detection(
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
  answer_utf16_length integer;
  expected_result_count integer;
  result_count integer;
  recommended_count integer;
  not_recommended_count integer;
  unknown_count integer;
  detection_fingerprint text;
  inserted_fingerprint text;
  existing_fingerprint text;
  existing_result_count integer;
  existing_recommended_count integer;
  existing_not_recommended_count integer;
  existing_unknown_count integer;
  result_value jsonb;
  result_index integer;
  occurrence_ordinal integer;
  previous_ordinal integer := -1;
  state_value text;
  evidence_value jsonb;
  evidence_start integer;
  evidence_end integer;
  evidence_text_value text;
  mention_entity_id uuid;
  mention_entity_kind text;
  mention_alias_id uuid;
  mention_start integer;
  mention_end integer;
  mention_text text;
begin
  if p_workspace_id is null
     or p_observation_id is null
     or p_catalog_id is null
     or p_detection is null
     or not app_private.jsonb_has_exact_keys(
       p_detection,
       array['methodVersion', 'mentionMethodVersion', 'results']
     )
     or p_detection ->> 'methodVersion' <> 'recommendation-detection-v1'
     or p_detection ->> 'mentionMethodVersion' <> 'mention-detection-v1'
     or jsonb_typeof(p_detection -> 'results') <> 'array'
     or jsonb_array_length(p_detection -> 'results') > 2000 then
    raise exception 'Invalid recommendation detection payload'
      using errcode = '22023';
  end if;

  select
    observation.project_id,
    observation.answer_text,
    mention_run.answer_utf16_length
  into
    resolved_project_id,
    answer_text_value,
    answer_utf16_length
  from public.raw_observations observation
  join public.mention_detection_runs mention_run
    on mention_run.workspace_id = observation.workspace_id
   and mention_run.project_id = observation.project_id
   and mention_run.observation_id = observation.observation_id
   and mention_run.catalog_id = p_catalog_id
   and mention_run.method_version = 'mention-detection-v1'
  where observation.workspace_id = p_workspace_id
    and observation.observation_id = p_observation_id;

  if not found then
    raise exception 'Recommendation detection input not found'
      using errcode = 'P0001';
  end if;
  if answer_text_value is null then
    raise exception 'Recommendation detection answer unavailable'
      using errcode = 'P0001';
  end if;

  select count(*)
  into expected_result_count
  from public.mention_detection_occurrences occurrence
  where occurrence.workspace_id = p_workspace_id
    and occurrence.project_id = resolved_project_id
    and occurrence.observation_id = p_observation_id
    and occurrence.catalog_id = p_catalog_id
    and occurrence.method_version = 'mention-detection-v1'
    and occurrence.state = 'mention';

  result_count := jsonb_array_length(p_detection -> 'results');
  if result_count <> expected_result_count then
    raise exception 'Recommendation result set does not match mention evidence'
      using errcode = '22023';
  end if;

  select
    count(*) filter (where value ->> 'state' = 'recommended'),
    count(*) filter (where value ->> 'state' = 'not_recommended'),
    count(*) filter (where value ->> 'state' = 'unknown')
  into recommended_count, not_recommended_count, unknown_count
  from jsonb_array_elements(p_detection -> 'results');

  if recommended_count + not_recommended_count + unknown_count <> result_count then
    raise exception 'Invalid recommendation detection payload'
      using errcode = '22023';
  end if;

  detection_fingerprint := encode(
    extensions.digest(convert_to(p_detection::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.recommendation_detection_runs (
    workspace_id,
    project_id,
    observation_id,
    catalog_id,
    method_version,
    mention_method_version,
    request_fingerprint,
    result_count,
    recommended_count,
    not_recommended_count,
    unknown_count
  ) values (
    p_workspace_id,
    resolved_project_id,
    p_observation_id,
    p_catalog_id,
    'recommendation-detection-v1',
    'mention-detection-v1',
    detection_fingerprint,
    result_count,
    recommended_count,
    not_recommended_count,
    unknown_count
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
      run.result_count,
      run.recommended_count,
      run.not_recommended_count,
      run.unknown_count
    into
      existing_fingerprint,
      existing_result_count,
      existing_recommended_count,
      existing_not_recommended_count,
      existing_unknown_count
    from public.recommendation_detection_runs run
    where run.workspace_id = p_workspace_id
      and run.project_id = resolved_project_id
      and run.observation_id = p_observation_id
      and run.catalog_id = p_catalog_id
      and run.method_version = 'recommendation-detection-v1'
    for update;

    if existing_fingerprint is distinct from detection_fingerprint then
      raise exception 'Recommendation detection replay conflicts with stored evidence'
        using errcode = '22023';
    end if;

    return jsonb_build_object(
      'observationId', p_observation_id,
      'catalogId', p_catalog_id,
      'methodVersion', 'recommendation-detection-v1',
      'resultCount', existing_result_count,
      'recommendedCount', existing_recommended_count,
      'notRecommendedCount', existing_not_recommended_count,
      'unknownCount', existing_unknown_count,
      'replayed', true
    );
  end if;

  for result_value, result_index in
    select value, ordinality - 1
    from jsonb_array_elements(p_detection -> 'results') with ordinality
  loop
    if not app_private.jsonb_has_exact_keys(
      result_value,
      array['occurrenceOrdinal', 'state', 'evidence']
    )
       or jsonb_typeof(result_value -> 'occurrenceOrdinal') <> 'number'
       or (result_value ->> 'occurrenceOrdinal') !~ '^[0-9]+$'
       or (result_value ->> 'state') not in (
         'recommended', 'not_recommended', 'unknown'
       ) then
      raise exception 'Invalid recommendation detection result'
        using errcode = '22023';
    end if;

    occurrence_ordinal := (result_value ->> 'occurrenceOrdinal')::integer;
    if occurrence_ordinal < 0
       or occurrence_ordinal > 1999
       or occurrence_ordinal <= previous_ordinal then
      raise exception 'Invalid recommendation detection result'
        using errcode = '22023';
    end if;
    previous_ordinal := occurrence_ordinal;
    state_value := result_value ->> 'state';

    select
      occurrence.entity_id,
      occurrence.entity_kind,
      occurrence.alias_id,
      occurrence.start_utf16,
      occurrence.end_utf16,
      occurrence.source_text
    into
      mention_entity_id,
      mention_entity_kind,
      mention_alias_id,
      mention_start,
      mention_end,
      mention_text
    from public.mention_detection_occurrences occurrence
    where occurrence.workspace_id = p_workspace_id
      and occurrence.project_id = resolved_project_id
      and occurrence.observation_id = p_observation_id
      and occurrence.catalog_id = p_catalog_id
      and occurrence.method_version = 'mention-detection-v1'
      and occurrence.occurrence_ordinal = occurrence_ordinal
      and occurrence.state = 'mention';

    if not found then
      raise exception 'Recommendation result does not match mention evidence'
        using errcode = '22023';
    end if;

    evidence_value := result_value -> 'evidence';
    evidence_start := null;
    evidence_end := null;
    evidence_text_value := null;

    if state_value = 'unknown' then
      if evidence_value is distinct from 'null'::jsonb then
        raise exception 'Unknown recommendation state cannot contain evidence'
          using errcode = '22023';
      end if;
    else
      if evidence_value is null
         or not app_private.jsonb_has_exact_keys(
           evidence_value,
           array['startUtf16', 'endUtf16', 'text']
         )
         or jsonb_typeof(evidence_value -> 'startUtf16') <> 'number'
         or jsonb_typeof(evidence_value -> 'endUtf16') <> 'number'
         or (evidence_value ->> 'startUtf16') !~ '^[0-9]+$'
         or (evidence_value ->> 'endUtf16') !~ '^[0-9]+$'
         or jsonb_typeof(evidence_value -> 'text') <> 'string' then
        raise exception 'Recommendation state requires exact evidence'
          using errcode = '22023';
      end if;

      evidence_start := (evidence_value ->> 'startUtf16')::integer;
      evidence_end := (evidence_value ->> 'endUtf16')::integer;
      evidence_text_value := evidence_value ->> 'text';
      if evidence_start < 0
         or evidence_end <= evidence_start
         or evidence_end > answer_utf16_length
         or evidence_start > mention_start
         or evidence_end < mention_end
         or char_length(evidence_text_value) < 1
         or octet_length(evidence_text_value) > 2097152
         or position(mention_text in evidence_text_value) = 0 then
        raise exception 'Recommendation evidence does not cover mention evidence'
          using errcode = '22023';
      end if;
    end if;

    insert into public.recommendation_detection_results (
      workspace_id,
      project_id,
      observation_id,
      catalog_id,
      method_version,
      mention_method_version,
      occurrence_ordinal,
      entity_id,
      entity_kind,
      alias_id,
      state,
      evidence_start_utf16,
      evidence_end_utf16,
      evidence_text
    ) values (
      p_workspace_id,
      resolved_project_id,
      p_observation_id,
      p_catalog_id,
      'recommendation-detection-v1',
      'mention-detection-v1',
      occurrence_ordinal,
      mention_entity_id,
      mention_entity_kind,
      mention_alias_id,
      state_value,
      evidence_start,
      evidence_end,
      evidence_text_value
    );
  end loop;

  return jsonb_build_object(
    'observationId', p_observation_id,
    'catalogId', p_catalog_id,
    'methodVersion', 'recommendation-detection-v1',
    'resultCount', result_count,
    'recommendedCount', recommended_count,
    'notRecommendedCount', not_recommended_count,
    'unknownCount', unknown_count,
    'replayed', false
  );
end;
$$;
revoke all on function app_private.persist_recommendation_detection(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function app_private.persist_recommendation_detection(uuid, uuid, uuid, jsonb)
  to service_role;

create function public.persist_recommendation_detection(
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
  select app_private.persist_recommendation_detection(
    p_workspace_id,
    p_observation_id,
    p_catalog_id,
    p_detection
  );
$$;
revoke all on function public.persist_recommendation_detection(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.persist_recommendation_detection(uuid, uuid, uuid, jsonb)
  to service_role;
