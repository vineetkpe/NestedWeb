create index scan_metering_summaries_workspace_scan_attempt_fk_idx
  on public.scan_metering_summaries (workspace_id, scan_id, attempt_id);
