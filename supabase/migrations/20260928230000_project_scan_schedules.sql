-- Project Scan Schedules Foundation
-- Automates periodic client monitoring scans (Monitor stage)

create table if not exists public.project_scan_schedules (
  project_id uuid primary key references public.projects (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  cadence text not null check (cadence in ('daily', 'weekly', 'biweekly', 'monthly', 'manual')),
  is_active boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_scan_schedules_workspace_idx
  on public.project_scan_schedules (workspace_id);

create index if not exists project_scan_schedules_due_idx
  on public.project_scan_schedules (is_active, next_run_at)
  where is_active = true and next_run_at is not null;

create trigger project_scan_schedules_updated_at before update on public.project_scan_schedules
  for each row execute function app_private.touch_updated_at();

alter table public.project_scan_schedules enable row level security;

revoke all on public.project_scan_schedules from public, anon, authenticated;
grant select, insert, update on public.project_scan_schedules to authenticated;

create policy project_scan_schedules_select_member on public.project_scan_schedules
  for select to authenticated using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = project_scan_schedules.workspace_id and m.user_id = (select auth.uid())
  ));

create policy project_scan_schedules_insert_member on public.project_scan_schedules
  for insert to authenticated with check (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = project_scan_schedules.workspace_id and m.user_id = (select auth.uid())
  ));

create policy project_scan_schedules_update_member on public.project_scan_schedules
  for update to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = project_scan_schedules.workspace_id and m.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = project_scan_schedules.workspace_id and m.user_id = (select auth.uid())
  ));

-- Auto-provisioning trigger for new projects
create or replace function app_private.auto_provision_project_scan_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_scan_schedules (
    project_id,
    workspace_id,
    cadence,
    is_active,
    next_run_at
  ) values (
    new.id,
    new.workspace_id,
    'weekly',
    true,
    now() + interval '7 days'
  )
  on conflict (project_id) do nothing;
  return new;
end;
$$;

drop trigger if exists project_auto_provision_scan_schedule on public.projects;
create trigger project_auto_provision_scan_schedule
after insert on public.projects
for each row
execute function app_private.auto_provision_project_scan_schedule();

-- Backfill existing projects with default weekly schedule
insert into public.project_scan_schedules (project_id, workspace_id, cadence, is_active, next_run_at)
select id, workspace_id, 'weekly', true, now() + interval '7 days'
from public.projects
on conflict (project_id) do nothing;
