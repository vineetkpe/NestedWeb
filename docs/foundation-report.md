# Foundation implementation report

Status: foundation complete and locally verified. Date: 2026-09-07. This is a development foundation, not a completed monitoring product.

## Repository and scope

Started with an unborn Git repository containing only `.vscode/mcp.json`. No separate product specification was available. Preserved the user's brief in `docs/foundation-brief.md` and documented assumptions in `docs/product-scope.md`. Existing MCP configuration was preserved. No commit, remote service, deployment, or product data was created.

## Deliverables

- Runnable single-route Next.js 16.3.4 / React 19.2.8 / TypeScript 5.9.3 / Tailwind 4.3.3 preview with honest empty state, evidence-method explanation, keyboard navigation, semantic tokens, and baseline HTTP headers.
- Eleven reviewed project skills, provenance and hashes; existing find-skills reused. Exact names/sources/reasons/deferred candidates in [agent-skills.md](agent-skills.md).
- Ponytail 4.9.0 installed and enabled through the requested marketplace/plugin commands. Source/lifecycle behavior reviewed; isolated Codex SessionStart hook passed in full mode. Automatic activation in a fresh thread remains a separate check.
- DESIGN.md generated with getdesign 0.6.25 using Airtable, then adapted for precision analytics. Original generated reference and license preserved.
- Master AGENTS.md, architecture decisions, strict code conventions, threat model, test/operation guides, proposed tenant schema, evidence methodology, job/retry/idempotency/partial-failure architecture, observability and server-enforced cost/entitlement rules.
- Exact dependencies/lockfile, npm lifecycle-script policy, formatting/lint/type/build scripts, desktop/mobile Playwright and axe checks, GitHub CI workflow with SHA-pinned official actions and read-only permissions.

## Files

Root contracts: `AGENTS.md`, `DESIGN.md`, `SECURITY.md`, `ARCHITECTURE.md`, `CODE_STYLE.md`, `TESTING.md`, `OPERATIONS.md`, `README.md`.

App/toolchain: `src/app/{layout.tsx,page.tsx,globals.css}`, `next.config.ts`, `next-env.d.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `playwright.config.ts`, `tests/e2e/foundation.spec.ts`, `package.json`, `package-lock.json`, `.npmrc`, `.node-version`, formatting/editor/Git ignore and attributes files, `.github/workflows/ci.yml`.

Supporting docs: `docs/{foundation-brief,product-scope,database-foundation,data-methodology,scanning-architecture,observability,agent-skills,foundation-report}.md`, `docs/reference/airtable.generated.md`, reference license. Agent files: eleven `.agents/skills` directories and `skills-lock.json`.

## Validation evidence

| Command / check                                   | Final result                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd ci --no-fund`                            | Pass: clean lockfile install with dependency lifecycle scripts disabled; 373 packages added                                         |
| `npm.cmd run verify`                              | Pass, exit 0: formatting, zero-warning lint, strict typecheck, production build, all 6 browser tests                                |
| `npm.cmd run format:check`                        | Pass as part of verification; repeated after final documentation edits                                                              |
| `npm.cmd run lint`                                | Pass as part of verification, no disabled rules to mask compatibility failure                                                       |
| `npm.cmd run typecheck`                           | Pass: route generation and strict TypeScript                                                                                        |
| `npm.cmd run build`                               | Pass: static `/` and framework not-found route                                                                                      |
| `npm.cmd test`                                    | Pass: 6/6 desktop/mobile Chromium tests; final run completed in 7.9 seconds and cleaned up its server                               |
| `npm.cmd audit --json`                            | Pass: 0 vulnerabilities across all reported severities                                                                              |
| `npm.cmd ls --depth=0`                            | Pass: expected direct dependencies installed                                                                                        |
| `npx.cmd playwright install chromium`             | Pass: pinned browser and required helpers installed                                                                                 |
| `codex plugin list --marketplace ponytail --json` | Pass: installed and enabled, version 4.9.0                                                                                          |
| Isolated Ponytail SessionStart invocation         | Pass: configured default full, valid Codex hook output/context, temporary local state                                               |
| Installed skill comparison                        | Pass: all 11 SKILL.md files match reviewed revisions after newline normalization                                                    |
| Desktop/mobile/narrow screenshots                 | Visually inspected at 1440, 390, and 320px; no page horizontal overflow; legible hierarchy and honest empty state                   |
| Documentation links / CI YAML                     | All authored relative document links resolve; workflow YAML parses, read-only permission and push/PR triggers present               |
| Independent read-only review                      | No critical, important, or actionable minor findings in authored source/config/contracts                                            |
| Original file integrity                           | MCP SHA-256 unchanged: `F6F2C020008DFF7D979E7ABCC4D164AFBAFBAFE9462953C5C9FB4165923DC3EA`; original generated design hash preserved |

Initial failures were resolved: PowerShell npm wrapper restriction by using `.cmd`; retired Next.js skill by using bundled framework docs; skills CLI commit-URL clone limitation by source-content verification; strict optional Playwright workers setting by using an explicit bounded count; PostCSS anonymous-export lint warning by naming the config. ESLint 10 was incompatible with the bundled React/import/a11y plugins and was replaced by compatible 9.39.5.

The sandboxed browser run passed assertions but stalled during server teardown. A second overlapping run correctly refused the occupied build/server. Task-owned servers were explicitly stopped and the final elevated `npm.cmd run verify` passed end-to-end with clean teardown. No application workaround or process-reuse setting was added to hide this environment issue.

Remaining warnings: ESLint 9 is deprecated upstream and awaits compatible upstream lint plugins (documented in ARCHITECTURE.md); the tool environment sets both NO_COLOR and FORCE_COLOR, producing a harmless console warning. Neither is reported as an application vulnerability. The npm audit is an advisory check, not a comprehensive security guarantee.

## Boundaries and next phase

No auth, database migrations, integrations, worker, billing, synthetic scores, or speculative components. Unit/domain and DB integration suites are absent because those implementations are absent. CI is configured but has not run on a hosted Linux runner. No full cross-browser, screen-reader, or production security certification is claimed.

Next: validate the agency workflow, then implement Supabase Auth plus one workspace/project slice with migrations, membership authorization, RLS allow/deny tests, generated DB types, and real UI states. Only then add one bounded grounded provider path and traceable raw evidence.
