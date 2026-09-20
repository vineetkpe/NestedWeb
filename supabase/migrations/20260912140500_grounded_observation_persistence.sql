alter table public.scan_attempt_queries
  add constraint scan_attempt_queries_observation_identity_key
  unique (workspace_id, scan_id, attempt_id, query_ordinal, observation_id);

create table public.raw_observations (
  workspace_id uuid not null,
  project_id uuid not null,
  scan_id uuid not null,
  attempt_id uuid not null,
  query_ordinal smallint not null check (query_ordinal between 0 and 9),
  observation_id uuid not null,
  query_id text not null check (char_length(query_id) between 1 and 8192),
  query_version text not null check (
    query_version = btrim(query_version)
    and char_length(query_version) between 1 and 120
  ),
  query_text text not null check (
    char_length(query_text) between 1 and 600
    and btrim(query_text) <> ''
  ),
  provider text not null check (provider = 'gemini'),
  surface text not null check (surface = 'api'),
  capture_version text not null check (
    capture_version = 'gemini-generate-content-v1'
  ),
  capture_mode text not null check (
    capture_mode in ('injected_transport', 'not_executed')
  ),
  requested_model text not null check (
    requested_model = btrim(requested_model)
    and char_length(requested_model) between 1 and 120
  ),
  model_version text check (
    model_version is null or char_length(model_version) between 1 and 512
  ),
  provider_response_id text check (
    provider_response_id is null
    or char_length(provider_response_id) between 1 and 512
  ),
  observed_at timestamptz not null,
  raw_response text check (
    raw_response is null or octet_length(raw_response) <= 2097152
  ),
  response_digest text check (
    response_digest is null or response_digest ~ '^sha256:[0-9a-f]{64}$'
  ),
  raw_response_state text not null check (
    raw_response_state in ('complete', 'not_received', 'discarded')
  ),
  outcome text not null check (
    outcome in ('answered', 'refused', 'partial', 'failed')
  ),
  failure_code text check (
    failure_code is null
    or failure_code in (
      'live_provider_unavailable',
      'busy',
      'cancelled',
      'timeout',
      'network_error',
      'unauthorized',
      'rate_limited',
      'provider_error',
      'invalid_response',
      'response_too_large',
      'credential_echo'
    )
  ),
  answer_text text check (
    answer_text is null or octet_length(answer_text) <= 2097152
  ),
  finish_reason text check (
    finish_reason is null or char_length(finish_reason) between 1 and 512
  ),
  grounding_metadata jsonb check (
    grounding_metadata is null
    or (
      jsonb_typeof(grounding_metadata) = 'object'
      and octet_length(grounding_metadata::text) <= 2097152
    )
  ),
  observation_fingerprint text not null check (
    observation_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default now(),
  primary key (workspace_id, observation_id),
  unique (workspace_id, scan_id, attempt_id, query_ordinal),
  foreign key (workspace_id, project_id, scan_id)
    references public.scans (workspace_id, project_id, id)
    on delete cascade,
  foreign key (
    workspace_id,
    scan_id,
    attempt_id,
    query_ordinal,
    observation_id
  ) references public.scan_attempt_queries (
    workspace_id,
    scan_id,
    attempt_id,
    query_ordinal,
    observation_id
  ) on delete cascade,
  check (
    (raw_response_state = 'complete'
      and raw_response is not null
      and response_digest is not null)
    or (raw_response_state in ('not_received', 'discarded')
      and raw_response is null
      and response_digest is null)
  ),
  check (
    (outcome = 'failed' and failure_code is not null)
    or (outcome <> 'failed' and failure_code is null)
  )
);
create index raw_observations_workspace_scan_idx
  on public.raw_observations (workspace_id, scan_id, query_ordinal);
create index raw_observations_project_observed_at_idx
  on public.raw_observations (workspace_id, project_id, observed_at desc);

create table public.raw_citations (
  workspace_id uuid not null,
  observation_id uuid not null,
  citation_ordinal smallint not null check (citation_ordinal between 0 and 49),
  citation_id text not null check (char_length(citation_id) between 1 and 256),
  cited_url text not null check (char_length(cited_url) between 1 and 8192),
  source_title text check (
    source_title is null or char_length(source_title) between 1 and 512
  ),
  captured_at timestamptz not null,
  relationship text not null check (relationship = 'source_list_only'),
  verification text not null check (verification = 'not_checked'),
  grounding_chunk_index smallint not null check (
    grounding_chunk_index between 0 and 49
  ),
  url_status text not null check (url_status in ('eligible', 'excluded')),
  source_domain text check (
    source_domain is null or char_length(source_domain) between 1 and 253
  ),
  exclusion_reason text check (
    exclusion_reason is null or exclusion_reason = 'unsafe_url'
  ),
  created_at timestamptz not null default now(),
  primary key (workspace_id, observation_id, citation_ordinal),
  unique (workspace_id, observation_id, citation_id),
  unique (workspace_id, observation_id, grounding_chunk_index),
  foreign key (workspace_id, observation_id)
    references public.raw_observations (workspace_id, observation_id)
    on delete cascade,
  check (
    (url_status = 'eligible'
      and source_domain is not null
      and exclusion_reason is null)
    or (url_status = 'excluded'
      and source_domain is null
      and exclusion_reason = 'unsafe_url')
  )
);

create function app_private.prevent_raw_evidence_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Raw provider evidence is immutable' using errcode = '22023';
end;
$$;
revoke all on function app_private.prevent_raw_evidence_update()
  from public, anon, authenticated, service_role;

create trigger raw_observations_prevent_update
before update on public.raw_observations
for each row execute function app_private.prevent_raw_evidence_update();
create trigger raw_citations_prevent_update
before update on public.raw_citations
for each row execute function app_private.prevent_raw_evidence_update();

alter table public.raw_observations enable row level security;
alter table public.raw_citations enable row level security;

revoke all on public.raw_observations, public.raw_citations
  from public, anon, authenticated, service_role;
grant select on public.raw_observations, public.raw_citations to authenticated;

create policy raw_observations_select_member
on public.raw_observations
for select to authenticated
using (exists (
  select 1
  from public.workspace_memberships membership
  where membership.workspace_id = raw_observations.workspace_id
    and membership.user_id = (select auth.uid())
));

create policy raw_citations_select_member
on public.raw_citations
for select to authenticated
using (exists (
  select 1
  from public.workspace_memberships membership
  where membership.workspace_id = raw_citations.workspace_id
    and membership.user_id = (select auth.uid())
));

create function app_private.persist_grounded_observation(
  p_workspace_id uuid,
  p_scan_id uuid,
  p_attempt_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_query_ordinal integer,
  p_observation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  lease app_private.scan_worker_leases%rowtype;
  expected record;
  existing public.raw_observations%rowtype;
  observation_uuid uuid;
  observation_fingerprint text;
  raw_response_value text;
  expected_digest text;
  next_state text;
  citation_count integer;
  citation_entry jsonb;
  citation_index integer;
  chunk_index integer;
  previous_chunk_index integer := -1;
  observed_at_value timestamptz;
begin
  if p_workspace_id is null
     or p_scan_id is null
     or p_attempt_id is null
     or p_worker_id is null
     or p_lease_token is null
     or p_query_ordinal is null
     or p_query_ordinal < 0
     or p_query_ordinal > 9
     or p_observation is null
     or jsonb_typeof(p_observation) <> 'object' then
    raise exception 'Invalid grounded observation request' using errcode = '22023';
  end if;

  select *
  into lease
  from app_private.scan_worker_leases current_lease
  where current_lease.workspace_id = p_workspace_id
    and current_lease.scan_id = p_scan_id
    and current_lease.attempt_id = p_attempt_id
    and current_lease.worker_id = p_worker_id
    and current_lease.lease_token = p_lease_token
  for update;
  if not found then
    raise exception 'Scan lease not found' using errcode = 'P0001';
  end if;
  if lease.lease_expires_at <= now_at then
    raise exception 'Scan lease expired' using errcode = 'P0001';
  end if;

  select
    attempt_query.observation_id,
    attempt_query.state as query_state,
    query.query_id,
    query.query_version,
    query.query_text,
    scan.project_id,
    scan.state as scan_state,
    attempt.state as attempt_state,
    reservation.provider,
    reservation.model_id
  into expected
  from public.scan_attempt_queries attempt_query
  join public.scan_queries query
    on query.workspace_id = attempt_query.workspace_id
   and query.scan_id = attempt_query.scan_id
   and query.query_ordinal = attempt_query.query_ordinal
  join public.scan_attempts attempt
    on attempt.workspace_id = attempt_query.workspace_id
   and attempt.scan_id = attempt_query.scan_id
   and attempt.id = attempt_query.attempt_id
  join public.scans scan
    on scan.workspace_id = attempt_query.workspace_id
   and scan.id = attempt_query.scan_id
  join app_private.scan_cost_reservations reservation
    on reservation.workspace_id = attempt_query.workspace_id
   and reservation.scan_id = attempt_query.scan_id
  where attempt_query.workspace_id = p_workspace_id
    and attempt_query.scan_id = p_scan_id
    and attempt_query.attempt_id = p_attempt_id
    and attempt_query.query_ordinal = p_query_ordinal
  for update of attempt_query;
  if not found then
    raise exception 'Scan observation identity not found' using errcode = 'P0001';
  end if;
  if expected.scan_state <> 'running' or expected.attempt_state <> 'running' then
    raise exception 'Scan lease invariant violated' using errcode = 'P0001';
  end if;

  if not (p_observation ?& array[
    'observationId',
    'queryId',
    'queryVersion',
    'queryText',
    'provider',
    'surface',
    'captureVersion',
    'captureMode',
    'requestedModel',
    'modelVersion',
    'providerResponseId',
    'observedAt',
    'rawResponse',
    'responseDigest',
    'rawResponseState',
    'outcome',
    'failureCode',
    'answerText',
    'finishReason',
    'groundingMetadata',
    'citations'
  ])
     or (select count(*) from jsonb_object_keys(p_observation)) <> 21
     or jsonb_typeof(p_observation -> 'observationId') <> 'string'
     or p_observation ->> 'observationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or jsonb_typeof(p_observation -> 'queryId') <> 'string'
     or jsonb_typeof(p_observation -> 'queryVersion') <> 'string'
     or jsonb_typeof(p_observation -> 'queryText') <> 'string'
     or jsonb_typeof(p_observation -> 'provider') <> 'string'
     or jsonb_typeof(p_observation -> 'surface') <> 'string'
     or jsonb_typeof(p_observation -> 'captureVersion') <> 'string'
     or jsonb_typeof(p_observation -> 'captureMode') <> 'string'
     or jsonb_typeof(p_observation -> 'requestedModel') <> 'string'
     or jsonb_typeof(p_observation -> 'modelVersion') not in ('string', 'null')
     or jsonb_typeof(p_observation -> 'providerResponseId') not in ('string', 'null')
     or jsonb_typeof(p_observation -> 'observedAt') <> 'string'
     or jsonb_typeof(p_observation -> 'rawResponse') not in ('string', 'null')
     or jsonb_typeof(p_observation -> 'responseDigest') not in ('string', 'null')
     or jsonb_typeof(p_observation -> 'rawResponseState') <> 'string'
     or jsonb_typeof(p_observation -> 'outcome') <> 'string'
     or jsonb_typeof(p_observation -> 'failureCode') not in ('string', 'null')
     or jsonb_typeof(p_observation -> 'answerText') not in ('string', 'null')
     or jsonb_typeof(p_observation -> 'finishReason') not in ('string', 'null')
     or jsonb_typeof(p_observation -> 'groundingMetadata') not in ('object', 'null')
     or jsonb_typeof(p_observation -> 'citations') <> 'array' then
    raise exception 'Invalid grounded observation payload' using errcode = '22023';
  end if;

  observation_uuid := (p_observation ->> 'observationId')::uuid;
  if observation_uuid is distinct from expected.observation_id
     or p_observation ->> 'queryId' is distinct from expected.query_id
     or p_observation ->> 'queryVersion' is distinct from expected.query_version
     or p_observation ->> 'queryText' is distinct from expected.query_text
     or p_observation ->> 'provider' is distinct from expected.provider
     or p_observation ->> 'provider' is distinct from 'gemini'
     or p_observation ->> 'surface' is distinct from 'api'
     or p_observation ->> 'captureVersion' is distinct from 'gemini-generate-content-v1'
     or p_observation ->> 'captureMode' not in ('injected_transport', 'not_executed')
     or p_observation ->> 'requestedModel' is distinct from expected.model_id then
    raise exception 'Grounded observation identity mismatch' using errcode = '22023';
  end if;

  if char_length(p_observation ->> 'queryId') not between 1 and 8192
     or char_length(p_observation ->> 'queryVersion') not between 1 and 120
     or char_length(p_observation ->> 'queryText') not between 1 and 600
     or btrim(p_observation ->> 'queryText') = ''
     or char_length(p_observation ->> 'requestedModel') not between 1 and 120
     or (jsonb_typeof(p_observation -> 'modelVersion') = 'string'
       and char_length(p_observation ->> 'modelVersion') not between 1 and 512)
     or (jsonb_typeof(p_observation -> 'providerResponseId') = 'string'
       and char_length(p_observation ->> 'providerResponseId') not between 1 and 512)
     or (jsonb_typeof(p_observation -> 'finishReason') = 'string'
       and char_length(p_observation ->> 'finishReason') not between 1 and 512)
     or (jsonb_typeof(p_observation -> 'answerText') = 'string'
       and octet_length(p_observation ->> 'answerText') > 2097152)
     or (jsonb_typeof(p_observation -> 'groundingMetadata') = 'object'
       and octet_length((p_observation -> 'groundingMetadata')::text) > 2097152) then
    raise exception 'Grounded observation payload too large' using errcode = '22023';
  end if;

  if p_observation ->> 'observedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
    raise exception 'Invalid grounded observation timestamp' using errcode = '22023';
  end if;
  begin
    observed_at_value := (p_observation ->> 'observedAt')::timestamptz;
  exception when others then
    raise exception 'Invalid grounded observation timestamp' using errcode = '22023';
  end;

  if p_observation ->> 'rawResponseState' not in ('complete', 'not_received', 'discarded')
     or p_observation ->> 'outcome' not in ('answered', 'refused', 'partial', 'failed')
     or (
       jsonb_typeof(p_observation -> 'failureCode') = 'string'
       and p_observation ->> 'failureCode' not in (
         'live_provider_unavailable',
         'busy',
         'cancelled',
         'timeout',
         'network_error',
         'unauthorized',
         'rate_limited',
         'provider_error',
         'invalid_response',
         'response_too_large',
         'credential_echo'
       )
     )
     or (p_observation ->> 'outcome' = 'failed'
       and jsonb_typeof(p_observation -> 'failureCode') <> 'string')
     or (p_observation ->> 'outcome' <> 'failed'
       and jsonb_typeof(p_observation -> 'failureCode') <> 'null') then
    raise exception 'Invalid grounded observation outcome' using errcode = '22023';
  end if;

  if p_observation ->> 'rawResponseState' = 'complete' then
    if jsonb_typeof(p_observation -> 'rawResponse') <> 'string'
       or jsonb_typeof(p_observation -> 'responseDigest') <> 'string'
       or (p_observation ->> 'responseDigest') !~ '^sha256:[0-9a-f]{64}$'
       or octet_length(p_observation ->> 'rawResponse') > 2097152 then
      raise exception 'Invalid raw response capture' using errcode = '22023';
    end if;
    raw_response_value := p_observation ->> 'rawResponse';
    expected_digest := 'sha256:' || encode(
      extensions.digest(convert_to(raw_response_value, 'UTF8'), 'sha256'),
      'hex'
    );
    if p_observation ->> 'responseDigest' is distinct from expected_digest then
      raise exception 'Raw response digest mismatch' using errcode = '22023';
    end if;
  else
    if jsonb_typeof(p_observation -> 'rawResponse') <> 'null'
       or jsonb_typeof(p_observation -> 'responseDigest') <> 'null' then
      raise exception 'Invalid raw response capture' using errcode = '22023';
    end if;
    raw_response_value := null;
  end if;

  citation_count := jsonb_array_length(p_observation -> 'citations');
  if citation_count > 50 then
    raise exception 'Too many grounded citations' using errcode = '22023';
  end if;

  citation_index := 0;
  for citation_entry in
    select value from jsonb_array_elements(p_observation -> 'citations')
  loop
    if jsonb_typeof(citation_entry) <> 'object'
       or not (citation_entry ?& array[
         'citationId',
         'observationId',
         'citedUrl',
         'sourceTitle',
         'capturedAt',
         'relationship',
         'verification',
         'groundingChunkIndex',
         'urlStatus',
         'sourceDomain',
         'exclusionReason'
       ])
       or (select count(*) from jsonb_object_keys(citation_entry)) <> 11
       or jsonb_typeof(citation_entry -> 'citationId') <> 'string'
       or jsonb_typeof(citation_entry -> 'observationId') <> 'string'
       or jsonb_typeof(citation_entry -> 'citedUrl') <> 'string'
       or jsonb_typeof(citation_entry -> 'sourceTitle') not in ('string', 'null')
       or jsonb_typeof(citation_entry -> 'capturedAt') <> 'string'
       or jsonb_typeof(citation_entry -> 'relationship') <> 'string'
       or jsonb_typeof(citation_entry -> 'verification') <> 'string'
       or jsonb_typeof(citation_entry -> 'groundingChunkIndex') <> 'number'
       or jsonb_typeof(citation_entry -> 'urlStatus') <> 'string'
       or jsonb_typeof(citation_entry -> 'sourceDomain') not in ('string', 'null')
       or jsonb_typeof(citation_entry -> 'exclusionReason') not in ('string', 'null') then
      raise exception 'Invalid grounded citation' using errcode = '22023';
    end if;

    if citation_entry ->> 'groundingChunkIndex' !~ '^(0|[1-9][0-9]?)$' then
      raise exception 'Invalid grounded citation' using errcode = '22023';
    end if;
    chunk_index := (citation_entry ->> 'groundingChunkIndex')::integer;
    if chunk_index < 0 or chunk_index > 49 or chunk_index <= previous_chunk_index then
      raise exception 'Invalid grounded citation order' using errcode = '22023';
    end if;
    previous_chunk_index := chunk_index;

    if citation_entry ->> 'observationId' is distinct from p_observation ->> 'observationId'
       or citation_entry ->> 'citationId' is distinct from
         ((p_observation ->> 'observationId') || ':grounding:' || chunk_index::text)
       or citation_entry ->> 'capturedAt' is distinct from p_observation ->> 'observedAt'
       or citation_entry ->> 'relationship' is distinct from 'source_list_only'
       or citation_entry ->> 'verification' is distinct from 'not_checked'
       or char_length(citation_entry ->> 'citationId') not between 1 and 256
       or char_length(citation_entry ->> 'citedUrl') not between 1 and 8192
       or (jsonb_typeof(citation_entry -> 'sourceTitle') = 'string'
         and char_length(citation_entry ->> 'sourceTitle') not between 1 and 512)
       or citation_entry ->> 'urlStatus' not in ('eligible', 'excluded') then
      raise exception 'Invalid grounded citation identity' using errcode = '22023';
    end if;

    if citation_entry ->> 'urlStatus' = 'eligible' then
      if jsonb_typeof(citation_entry -> 'sourceDomain') <> 'string'
         or char_length(citation_entry ->> 'sourceDomain') not between 1 and 253
         or jsonb_typeof(citation_entry -> 'exclusionReason') <> 'null' then
        raise exception 'Invalid eligible grounded citation' using errcode = '22023';
      end if;
    else
      if jsonb_typeof(citation_entry -> 'sourceDomain') <> 'null'
         or citation_entry ->> 'exclusionReason' is distinct from 'unsafe_url' then
        raise exception 'Invalid excluded grounded citation' using errcode = '22023';
      end if;
    end if;

    citation_index := citation_index + 1;
  end loop;

  observation_fingerprint := encode(
    extensions.digest(convert_to(p_observation::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select *
  into existing
  from public.raw_observations observation
  where observation.workspace_id = p_workspace_id
    and observation.observation_id = observation_uuid
  for share;
  if found then
    if existing.scan_id is distinct from p_scan_id
       or existing.attempt_id is distinct from p_attempt_id
       or existing.query_ordinal is distinct from p_query_ordinal
       or existing.observation_fingerprint is distinct from observation_fingerprint then
      raise exception 'Observation replay conflicts with stored evidence'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'observationId', existing.observation_id,
      'state', case
        when existing.outcome = 'failed' and existing.failure_code = 'cancelled' then 'cancelled'
        else existing.outcome
      end,
      'citationCount', (
        select count(*)
        from public.raw_citations citation
        where citation.workspace_id = p_workspace_id
          and citation.observation_id = observation_uuid
      ),
      'replayed', true
    );
  end if;

  if expected.query_state not in ('unattempted', 'running') then
    raise exception 'Scan query already finalized without matching evidence'
      using errcode = 'P0001';
  end if;

  insert into public.raw_observations (
    workspace_id,
    project_id,
    scan_id,
    attempt_id,
    query_ordinal,
    observation_id,
    query_id,
    query_version,
    query_text,
    provider,
    surface,
    capture_version,
    capture_mode,
    requested_model,
    model_version,
    provider_response_id,
    observed_at,
    raw_response,
    response_digest,
    raw_response_state,
    outcome,
    failure_code,
    answer_text,
    finish_reason,
    grounding_metadata,
    observation_fingerprint
  ) values (
    p_workspace_id,
    expected.project_id,
    p_scan_id,
    p_attempt_id,
    p_query_ordinal,
    observation_uuid,
    p_observation ->> 'queryId',
    p_observation ->> 'queryVersion',
    p_observation ->> 'queryText',
    p_observation ->> 'provider',
    p_observation ->> 'surface',
    p_observation ->> 'captureVersion',
    p_observation ->> 'captureMode',
    p_observation ->> 'requestedModel',
    nullif(p_observation ->> 'modelVersion', ''),
    nullif(p_observation ->> 'providerResponseId', ''),
    observed_at_value,
    raw_response_value,
    nullif(p_observation ->> 'responseDigest', ''),
    p_observation ->> 'rawResponseState',
    p_observation ->> 'outcome',
    nullif(p_observation ->> 'failureCode', ''),
    nullif(p_observation ->> 'answerText', ''),
    nullif(p_observation ->> 'finishReason', ''),
    case
      when jsonb_typeof(p_observation -> 'groundingMetadata') = 'null' then null
      else p_observation -> 'groundingMetadata'
    end,
    observation_fingerprint
  );

  citation_index := 0;
  for citation_entry in
    select value from jsonb_array_elements(p_observation -> 'citations')
  loop
    insert into public.raw_citations (
      workspace_id,
      observation_id,
      citation_ordinal,
      citation_id,
      cited_url,
      source_title,
      captured_at,
      relationship,
      verification,
      grounding_chunk_index,
      url_status,
      source_domain,
      exclusion_reason
    ) values (
      p_workspace_id,
      observation_uuid,
      citation_index,
      citation_entry ->> 'citationId',
      citation_entry ->> 'citedUrl',
      nullif(citation_entry ->> 'sourceTitle', ''),
      observed_at_value,
      'source_list_only',
      'not_checked',
      (citation_entry ->> 'groundingChunkIndex')::integer,
      citation_entry ->> 'urlStatus',
      nullif(citation_entry ->> 'sourceDomain', ''),
      nullif(citation_entry ->> 'exclusionReason', '')
    );
    citation_index := citation_index + 1;
  end loop;

  next_state := case
    when p_observation ->> 'outcome' = 'failed'
      and p_observation ->> 'failureCode' = 'cancelled' then 'cancelled'
    else p_observation ->> 'outcome'
  end;

  update public.scan_attempt_queries
  set state = next_state,
      boundary_failure_code = null
  where workspace_id = p_workspace_id
    and scan_id = p_scan_id
    and attempt_id = p_attempt_id
    and query_ordinal = p_query_ordinal;

  return jsonb_build_object(
    'observationId', observation_uuid,
    'state', next_state,
    'citationCount', citation_count,
    'replayed', false
  );
end;
$$;
revoke all on function app_private.persist_grounded_observation(
  uuid, uuid, uuid, uuid, uuid, integer, jsonb
) from public, anon, authenticated, service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.persist_grounded_observation(
  uuid, uuid, uuid, uuid, uuid, integer, jsonb
) to service_role;

create function public.persist_grounded_observation(
  p_workspace_id uuid,
  p_scan_id uuid,
  p_attempt_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_query_ordinal integer,
  p_observation jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.persist_grounded_observation(
    p_workspace_id,
    p_scan_id,
    p_attempt_id,
    p_worker_id,
    p_lease_token,
    p_query_ordinal,
    p_observation
  );
$$;
revoke all on function public.persist_grounded_observation(
  uuid, uuid, uuid, uuid, uuid, integer, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.persist_grounded_observation(
  uuid, uuid, uuid, uuid, uuid, integer, jsonb
) to service_role;