create index raw_observations_workspace_project_scan_fk_idx
  on public.raw_observations (workspace_id, project_id, scan_id);

create index raw_observations_attempt_identity_fk_idx
  on public.raw_observations (
    workspace_id,
    scan_id,
    attempt_id,
    query_ordinal,
    observation_id
  );
