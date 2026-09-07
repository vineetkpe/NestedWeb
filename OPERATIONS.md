# Operations

## Local development

Node 24, npm 11.17.0. `npm ci`, then `npm run dev` serves loopback port 3000. No `.env` is needed. Use `.cmd` wrappers on restricted PowerShell. Do not relax machine execution policy. Install Playwright Chromium once with `npx playwright install chromium`; then `npm run verify`.

`npm run start` serves a prior production build on loopback port 3000. The host must choose an appropriate interface/proxy at deployment; local commands intentionally do not expose a LAN service. Browser tests start their own production server on 3100 and fail rather than attach to another process. If the port is occupied, identify its owner; do not kill unrelated processes.

## Dependencies and agent tooling

Use the lockfile and exact versions. Review updates and install scripts, run verification/audit, and document compatibility constraints. `.npmrc` disables dependency lifecycle scripts via `ignore-scripts=true`; direct `npm run` commands still execute. Native bindings arrive as platform-specific optional packages. The `unrs-resolver` postinstall can download/reinstall bindings; it is unnecessary when the optional binding is present. If a new platform lacks a binary, investigate its optional dependency installation before granting one narrowly reviewed rebuild. npm 11.17's `allowScripts` metadata is not yet enforcement; it does not replace `ignore-scripts`.

ESLint 9.39.5 is deprecated upstream but currently required by Next.js's bundled lint plugins; see ARCHITECTURE.md. No global framework installs. Project skills are vendored under `.agents/skills`; consult [agent-skills.md](docs/agent-skills.md). New skills load on the next turn; restart the Codex thread to verify newly installed plugin lifecycle hooks.

Ponytail setup on another development machine:

```sh
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
codex plugin list --marketplace ponytail --json
```

Ponytail defaults to `full`. Project safety rules override minimal-code shortcuts. Do not configure unrelated Claude status lines or install another browser stack just because a skill mentions them.

## Deployment boundary

No hosting target, production domain, deploy credentials, environment, or deployment was created. CI is local repository configuration until pushed to a GitHub host. Before the first deployment: run `npm ci`, `npm run verify`, `npm audit`; select host/runtime; configure HTTPS/HSTS and the CSP needed for actual routes; define private security contact and monitoring; inspect public artifacts. No deployment secrets are required for the current tests.

With auth/data: separate development/staging/production projects, validate server environment, review key permissions and RLS, establish retention, verify backup restore, and run migrations in a reviewed sequence. Prefer expand/contract migrations and forward repair. Application rollback cannot undo a destructive migration; never automate database reset as rollback.

## Incident response once live

1. Identify affected tenant/surface with safe correlation IDs; record time and scope privately.
2. Contain: disable new paid work for cost incidents; revoke compromised keys/sessions for leakage; restrict impacted routes for access-control failures.
3. Preserve private raw evidence and redacted logs. Do not paste credentials or customer data into tickets/chat.
4. Diagnose and fix root cause with a regression test. Reconcile ambiguous attempts/reservations before retrying provider work.
5. Verify restore/rollback/forward repair in staging, validate isolation and budget behavior, then resume under monitoring.
6. Record cause, impact, recovery and follow-up owner. Assign actual owners and escalation channels before production.

Operational alerts, backups, usage controls, and job kill switches above are requirements for future implementation, not currently running services.
