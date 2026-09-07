# Observability conventions

Current app: framework logs only. No scan traffic, structured logger, vendor, collector, or monitoring dashboard is implemented. Add structured JSON events at the first application boundary, using standard console output and an allowlisted event shape until concrete requirements justify a library.

## Event contract

Common fields: `timestamp` (UTC), `level`, `event`, `requestId`, optional `workspaceId`/`projectId`/`scanId`/`attemptId`, `durationMs`, safe `errorCode`, and application version. IDs must be internally generated or validated/length-bounded. Do not use arbitrary caller strings as log event names.

Job/provider events add provider/model identifiers, attempt number, retry delay, safe status, usage units, reservation/settlement ID, and estimated cost with currency/price version where available. Never label estimates as invoice truth. HTTP logs need route template/status/duration, not a raw URL with tokens/query strings.

Event names when their behavior exists: `request.failed`, `authorization.denied`, `scan.queued`, `scan.claimed`, `scan.partial`, `scan.completed`, `scan.failed`, `scan.cancelled`, `scan.lease_expired`, `provider.completed`, `provider.failed`, `provider.retry_scheduled`, `usage.reserved`, `usage.settled`, `usage.denied`.

No prompts, full answers, access/refresh tokens, cookies, API keys, email addresses, auth headers, raw exceptions, or arbitrary provider bodies in logs. Evidence lives in access-controlled storage, not logging. Logs containing tenant IDs remain sensitive. Traces/browser screenshots are private diagnostics with access limits and retention, not public artifacts.

## Operational questions

Measure error rate, queue age, job duration and terminal outcomes, partial/invalid normalization rate, provider latency/rate-limit errors, retries per run, stale leases, reserved-versus-settled usage, and budget-denial counts. Metrics labels use bounded dimensions such as provider and outcome; do not use tenant/request IDs as unbounded time-series labels.

Before production choose owner, log destination, retention/deletion, baseline latency and cost budgets. No invented SLOs now. Page on sustained failure, stuck leases, unauthorized access patterns, or unexpected paid usage once measured thresholds exist. For a cost incident: disable new provider work, preserve uncertain reservations, inspect attempt IDs, reconcile charges, then resume deliberately. OPERATIONS.md owns response procedure.
