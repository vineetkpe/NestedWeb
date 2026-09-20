create policy workspace_bootstrap_requests_deny_clients
on app_private.workspace_bootstrap_requests
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
