create table public.citation_url_normalizations (
  workspace_id uuid not null,
  observation_id uuid not null,
  citation_id text not null check (char_length(citation_id) between 1 and 256),
  method_version text not null check (method_version = 'citation-url-v1'),
  normalization_state text not null check (
    normalization_state in ('normalized', 'excluded')
  ),
  canonical_url text check (
    canonical_url is null or char_length(canonical_url) between 1 and 8192
  ),
  canonical_domain text check (
    canonical_domain is null or char_length(canonical_domain) between 1 and 253
  ),
  exclusion_reason text check (
    exclusion_reason is null
    or exclusion_reason in ('invalid_url', 'unsupported_scheme', 'unsafe_url')
  ),
  created_at timestamptz not null default now(),
  primary key (workspace_id, observation_id, citation_id, method_version),
  foreign key (workspace_id, observation_id, citation_id)
    references public.raw_citations (workspace_id, observation_id, citation_id)
    on delete cascade,
  check (
    (
      normalization_state = 'normalized'
      and canonical_url is not null
      and canonical_domain is not null
      and exclusion_reason is null
    )
    or (
      normalization_state = 'excluded'
      and canonical_url is null
      and canonical_domain is null
      and exclusion_reason is not null
    )
  )
);

create function app_private.prevent_citation_url_normalization_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Citation URL normalizations are immutable' using errcode = '22023';
end;
$$;
revoke all on function app_private.prevent_citation_url_normalization_update()
  from public, anon, authenticated, service_role;

create trigger citation_url_normalizations_prevent_update
before update on public.citation_url_normalizations
for each row execute function app_private.prevent_citation_url_normalization_update();

alter table public.citation_url_normalizations enable row level security;
revoke all on public.citation_url_normalizations
  from public, anon, authenticated, service_role;
grant select on public.citation_url_normalizations to authenticated;

create policy citation_url_normalizations_select_member
on public.citation_url_normalizations
for select to authenticated
using (exists (
  select 1
  from public.workspace_memberships membership
  where membership.workspace_id = citation_url_normalizations.workspace_id
    and membership.user_id = (select auth.uid())
));

create function app_private.persist_citation_url_normalization(
  p_workspace_id uuid,
  p_observation_id uuid,
  p_citation_id text,
  p_normalization jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  method_version_value text;
  state_value text;
  canonical_url_value text;
  canonical_domain_value text;
  exclusion_reason_value text;
  inserted_count integer;
  existing public.citation_url_normalizations%rowtype;
begin
  if p_workspace_id is null
     or p_observation_id is null
     or p_citation_id is null
     or char_length(p_citation_id) not between 1 and 256
     or p_normalization is null
     or jsonb_typeof(p_normalization) <> 'object' then
    raise exception 'Invalid citation normalization request' using errcode = '22023';
  end if;

  if not (p_normalization ?& array[
    'methodVersion',
    'state',
    'canonicalUrl',
    'canonicalDomain',
    'exclusionReason'
  ])
     or (select count(*) from jsonb_object_keys(p_normalization)) <> 5
     or jsonb_typeof(p_normalization -> 'methodVersion') <> 'string'
     or jsonb_typeof(p_normalization -> 'state') <> 'string'
     or jsonb_typeof(p_normalization -> 'canonicalUrl') not in ('string', 'null')
     or jsonb_typeof(p_normalization -> 'canonicalDomain') not in ('string', 'null')
     or jsonb_typeof(p_normalization -> 'exclusionReason') not in ('string', 'null') then
    raise exception 'Invalid citation normalization payload' using errcode = '22023';
  end if;

  method_version_value := p_normalization ->> 'methodVersion';
  state_value := p_normalization ->> 'state';
  canonical_url_value := nullif(p_normalization ->> 'canonicalUrl', '');
  canonical_domain_value := nullif(p_normalization ->> 'canonicalDomain', '');
  exclusion_reason_value := nullif(p_normalization ->> 'exclusionReason', '');

  if method_version_value is distinct from 'citation-url-v1'
     or state_value not in ('normalized', 'excluded') then
    raise exception 'Invalid citation normalization payload' using errcode = '22023';
  end if;

  if state_value = 'normalized' then
    if jsonb_typeof(p_normalization -> 'canonicalUrl') <> 'string'
       or jsonb_typeof(p_normalization -> 'canonicalDomain') <> 'string'
       or jsonb_typeof(p_normalization -> 'exclusionReason') <> 'null'
       or canonical_url_value is null
       or canonical_domain_value is null
       or canonical_url_value is distinct from btrim(canonical_url_value)
       or canonical_domain_value is distinct from btrim(canonical_domain_value)
       or char_length(canonical_url_value) not between 1 and 8192
       or char_length(canonical_domain_value) not between 1 and 253
       or canonical_url_value !~ '^https?://'
       or canonical_domain_value <> lower(canonical_domain_value) then
      raise exception 'Invalid normalized citation URL' using errcode = '22023';
    end if;
  else
    if jsonb_typeof(p_normalization -> 'canonicalUrl') <> 'null'
       or jsonb_typeof(p_normalization -> 'canonicalDomain') <> 'null'
       or jsonb_typeof(p_normalization -> 'exclusionReason') <> 'string'
       or exclusion_reason_value not in (
         'invalid_url',
         'unsupported_scheme',
         'unsafe_url'
       ) then
      raise exception 'Invalid excluded citation URL' using errcode = '22023';
    end if;
  end if;

  perform 1
  from public.raw_citations citation
  where citation.workspace_id = p_workspace_id
    and citation.observation_id = p_observation_id
    and citation.citation_id = p_citation_id;
  if not found then
    raise exception 'Raw citation not found' using errcode = 'P0001';
  end if;

  insert into public.citation_url_normalizations (
    workspace_id,
    observation_id,
    citation_id,
    method_version,
    normalization_state,
    canonical_url,
    canonical_domain,
    exclusion_reason
  ) values (
    p_workspace_id,
    p_observation_id,
    p_citation_id,
    method_version_value,
    state_value,
    canonical_url_value,
    canonical_domain_value,
    exclusion_reason_value
  )
  on conflict (workspace_id, observation_id, citation_id, method_version)
  do nothing;
  get diagnostics inserted_count = row_count;

  select *
  into existing
  from public.citation_url_normalizations normalization
  where normalization.workspace_id = p_workspace_id
    and normalization.observation_id = p_observation_id
    and normalization.citation_id = p_citation_id
    and normalization.method_version = method_version_value;
  if not found then
    raise exception 'Citation normalization persistence invariant violated'
      using errcode = 'P0001';
  end if;

  if existing.normalization_state is distinct from state_value
     or existing.canonical_url is distinct from canonical_url_value
     or existing.canonical_domain is distinct from canonical_domain_value
     or existing.exclusion_reason is distinct from exclusion_reason_value then
    raise exception 'Citation normalization replay conflicts with stored evidence'
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'observationId', existing.observation_id,
    'citationId', existing.citation_id,
    'methodVersion', existing.method_version,
    'state', existing.normalization_state,
    'replayed', inserted_count = 0
  );
end;
$$;
revoke all on function app_private.persist_citation_url_normalization(
  uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.persist_citation_url_normalization(
  uuid, uuid, text, jsonb
) to service_role;

create function public.persist_citation_url_normalization(
  p_workspace_id uuid,
  p_observation_id uuid,
  p_citation_id text,
  p_normalization jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.persist_citation_url_normalization(
    p_workspace_id,
    p_observation_id,
    p_citation_id,
    p_normalization
  );
$$;
revoke all on function public.persist_citation_url_normalization(
  uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.persist_citation_url_normalization(
  uuid, uuid, text, jsonb
) to service_role;