create function app_private.list_raw_citations_for_normalization(
  p_workspace_id uuid,
  p_observation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  citation_count integer;
  citations jsonb;
begin
  if p_workspace_id is null or p_observation_id is null then
    raise exception 'Invalid citation normalization read request'
      using errcode = '22023';
  end if;

  perform 1
  from public.raw_observations observation
  where observation.workspace_id = p_workspace_id
    and observation.observation_id = p_observation_id;
  if not found then
    raise exception 'Raw observation not found' using errcode = 'P0001';
  end if;

  select count(*), coalesce(
    jsonb_agg(
      jsonb_build_object(
        'citationOrdinal', citation.citation_ordinal,
        'citationId', citation.citation_id,
        'citedUrl', citation.cited_url
      )
      order by citation.citation_ordinal
    ),
    '[]'::jsonb
  )
  into citation_count, citations
  from public.raw_citations citation
  where citation.workspace_id = p_workspace_id
    and citation.observation_id = p_observation_id;

  if citation_count > 50 then
    raise exception 'Raw citation count invariant violated' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'observationId', p_observation_id,
    'citations', citations
  );
end;
$$;
revoke all on function app_private.list_raw_citations_for_normalization(uuid, uuid)
  from public, anon, authenticated, service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.list_raw_citations_for_normalization(uuid, uuid)
  to service_role;

create function public.list_raw_citations_for_normalization(
  p_workspace_id uuid,
  p_observation_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.list_raw_citations_for_normalization(
    p_workspace_id,
    p_observation_id
  );
$$;
revoke all on function public.list_raw_citations_for_normalization(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_raw_citations_for_normalization(uuid, uuid)
  to service_role;
