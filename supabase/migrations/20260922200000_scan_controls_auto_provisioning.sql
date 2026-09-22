-- Automatic Scan Controls Provisioning and Provider Seed
-- Ensures all existing and newly created workspaces and projects have valid
-- budget windows and provider configs for Gemini 2.5 Flash execution.

-- 1. Seed Gemini Provider and Metering Configuration
insert into app_private.scan_provider_configs (
  provider,
  model_id,
  price_version,
  currency,
  worst_case_cost_per_query_microunits,
  max_output_tokens,
  max_global_active_scans,
  enabled
) values (
  'gemini',
  'gemini-3.6-flash',
  'gemini-3.6-flash-v1',
  'USD',
  20000,
  8192,
  10,
  true
)
on conflict (provider, model_id, price_version) do update set
  enabled = true,
  worst_case_cost_per_query_microunits = excluded.worst_case_cost_per_query_microunits,
  max_output_tokens = excluded.max_output_tokens;

insert into app_private.scan_provider_metering_configs (
  provider,
  model_id,
  price_version,
  cost_basis,
  input_microunits_per_million_tokens,
  output_microunits_per_million_tokens,
  search_microunits_per_thousand_queries
) values (
  'gemini',
  'gemini-3.6-flash',
  'gemini-3.6-flash-v1',
  'gross_list_price',
  75000,
  300000,
  0
)
on conflict (provider, model_id, price_version) do nothing;

-- 2. Trigger Function for Automatic Workspace Scan Control Provisioning
create or replace function app_private.auto_provision_workspace_scan_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.workspace_scan_controls (
    workspace_id,
    provider,
    model_id,
    price_version,
    enabled,
    max_queries_per_scan,
    max_attempts_per_scan,
    max_concurrent_scans,
    max_scans_per_window,
    budget_window_start,
    budget_window_end,
    budget_microunits
  ) values (
    NEW.id,
    'gemini',
    'gemini-3.6-flash',
    'gemini-3.6-flash-v1',
    true,
    10,
    2,
    2,
    50,
    now() - interval '1 hour',
    now() + interval '365 days',
    10000000
  ) on conflict (workspace_id) do nothing;
  return NEW;
end;
$$;

revoke all on function app_private.auto_provision_workspace_scan_controls() from public, anon, authenticated;

drop trigger if exists workspaces_auto_provision_scan_controls on public.workspaces;
create trigger workspaces_auto_provision_scan_controls
  after insert on public.workspaces
  for each row
  execute function app_private.auto_provision_workspace_scan_controls();

-- 3. Trigger Function for Automatic Project Scan Control Provisioning
create or replace function app_private.auto_provision_project_scan_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.project_scan_controls (
    workspace_id,
    project_id,
    enabled,
    max_queries_per_scan,
    max_attempts_per_scan,
    max_concurrent_scans,
    max_scans_per_window,
    budget_window_start,
    budget_window_end,
    budget_microunits
  ) values (
    NEW.workspace_id,
    NEW.id,
    true,
    10,
    2,
    2,
    25,
    now() - interval '1 hour',
    now() + interval '365 days',
    5000000
  ) on conflict (workspace_id, project_id) do nothing;
  return NEW;
end;
$$;

revoke all on function app_private.auto_provision_project_scan_controls() from public, anon, authenticated;

drop trigger if exists projects_auto_provision_scan_controls on public.projects;
create trigger projects_auto_provision_scan_controls
  after insert on public.projects
  for each row
  execute function app_private.auto_provision_project_scan_controls();

-- 4. Backfill Existing Workspaces and Projects
insert into app_private.workspace_scan_controls (
  workspace_id,
  provider,
  model_id,
  price_version,
  enabled,
  max_queries_per_scan,
  max_attempts_per_scan,
  max_concurrent_scans,
  max_scans_per_window,
  budget_window_start,
  budget_window_end,
  budget_microunits
)
select
  w.id,
  'gemini',
  'gemini-3.6-flash',
  'gemini-3.6-flash-v1',
  true,
  10,
  2,
  2,
  50,
  now() - interval '1 hour',
  now() + interval '365 days',
  10000000
from public.workspaces w
on conflict (workspace_id) do update set
  enabled = true,
  max_queries_per_scan = 10,
  budget_window_end = now() + interval '365 days';

insert into app_private.project_scan_controls (
  workspace_id,
  project_id,
  enabled,
  max_queries_per_scan,
  max_attempts_per_scan,
  max_concurrent_scans,
  max_scans_per_window,
  budget_window_start,
  budget_window_end,
  budget_microunits
)
select
  p.workspace_id,
  p.id,
  true,
  10,
  2,
  2,
  25,
  now() - interval '1 hour',
  now() + interval '365 days',
  5000000
from public.projects p
on conflict (workspace_id, project_id) do update set
  enabled = true,
  max_queries_per_scan = 10,
  budget_window_end = now() + interval '365 days';
