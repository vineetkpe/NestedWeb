# Scanning architecture (proposed)

No scanner or worker is implemented. Start with one grounded provider and a small fixed query cohort after authenticated tenant isolation works. Candidate: durable Postgres job/attempt records and one worker scheduled by the chosen host. Runtime selection remains open. No queue broker, long-running HTTP request, browser scraper, fire-and-forget promise, or in-memory job state is introduced now.

## Flow and states

```text
authenticated request -> authorize -> reserve budget + persist job -> queued
queued -> atomic worker claim with lease -> running
running -> bounded provider execution -> immutable raw observation
        -> versioned normalization -> deterministic metrics
        -> evidence-backed recommendation only if a validated rule exists
        -> completed | partial | failed | cancelled
```

Queued work may be cancelled. Retryable execution returns to queued with a future `next_attempt_at` only while budgets permit. Terminal jobs stay terminal; an explicit rerun is a new job. A run is complete only after its evidence is durable. “Partial” means some planned observations succeeded and others did not; all-failed is failed. Track attempts independently so parser failure never forces a paid re-execution.

## Correctness and bounded execution

- **Enqueue:** in one transaction verify membership/entitlement, reserve worst-case allowed cost, and insert a unique `(workspace_id, idempotency_key)` job. Store normalized request fingerprint; replay with the same payload returns the existing job, changed payload yields conflict. Client never selects another tenant by passing an ID.
- **Claim:** transactionally claim due jobs (e.g. `FOR UPDATE SKIP LOCKED`), issue a lease token/generation and expiry. Completion requires the current token so a stale worker cannot overwrite a newer result. Heartbeat only inside the total deadline. Expired leases are reconciled, not blindly marked successful.
- **Execution:** adapter declares ID/version, supported grounding/citation capabilities and model/config, then `execute` and `normalize`. `execute` accepts a cancellation signal and finite limits; `normalize` validates unknown data and produces an explicit complete/partial/refused/invalid result. SDK error shapes never leak to callers.
- **Retries:** proposed initial bounds are 3 total attempts, 30 seconds per provider request, and 120 seconds total job deadline; validate against the selected provider/host before use. Retry only transient/rate-limit errors, with exponential jitter and capped Retry-After within the remaining deadline. Auth/config/schema errors do not retry automatically. Manual retry is also budgeted.
- **Partial failure:** persist each completed observation independently. Normalization can retry locally from raw evidence, with its own version and bounded attempts. Display completeness/exclusions alongside metrics. Recommendation generation is optional and must not block evidence availability.
- **Reproducibility:** freeze prompt/config/model IDs and method versions on enqueue; preserve provider request ID, attempt IDs, timestamps, raw payload digest, and extraction version. Treat exact replay as unavailable unless the provider guarantees it.
- **Cancellation:** stop unstarted attempts, abort in-flight requests where possible, keep received evidence, and reconcile billable work. Cancellation is not proof that provider charges stopped.

## Crash recovery and idempotency limits

At-least-once delivery is the assumption. A crash after provider billing but before durable response storage leaves an ambiguous attempt. Use provider idempotency keys/retrieval only if documented. Otherwise mark the attempt uncertain, retain its reservation, and reconcile rather than silently resubmit and double-charge. Do not claim exactly-once provider execution.

Use unique attempt/observation identifiers and transactional settlement to prevent double recording. Work and cost accounting update with the lease token. Releasing a lease or timing out never erases usage history.

## Entitlements, usage, and cost

Application services enforce access and budgets server-side, both on enqueue and worker execution (membership may be revoked while queued). No plan names, prices, or fake subscriptions in this phase.

Default to zero paid calls unless finite workspace/project and provider limits are configured. Atomically reserve worst-case cost for allowed attempts; limit input bytes, output tokens, requests per day/month, concurrent jobs per workspace, and global provider concurrency. Price estimates carry currency and price version. Unknown price/limit fails closed. Store integer monetary units; report estimated versus reported usage distinctly. Every paid attempt consumes the reservation; settlement is idempotent and may release only confirmed unused amounts.

Deduplicate identical requests within tenant/config scope where product semantics allow. Do not use cross-tenant response caching. Reprocessing stored evidence should not invoke the provider. An operator switch must prevent new paid work immediately; automatic retries obey the same switch and budgets.

Billing provider is deferred. Verified billing events eventually update entitlements through a separate idempotent server boundary. UI only displays entitlements. No worker trusts browser plan flags, webhook query strings, or client-computed balances.

## Signals and tests

Emit request/scan/attempt correlation IDs and safe state changes; see [observability.md](observability.md). Before enabling paid scans, test concurrent duplicate requests, conflicting idempotency payloads, lease takeover, crash-after-charge, parser-only retry, exhaustion, timeout, cancellation, partial completion, stale-worker writes, and revoked membership. Use fixtures/fake adapters in tests; no paid CI calls.
