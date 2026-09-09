# AI Visibility OS

Foundation for agency-first, evidence-backed AI-answer monitoring. The app contains an honest product preview at `/` and a report prototype at `/report`, with unexecuted query templates and empty evidence/metric/action states. The [report specification](docs/report-specification.md) defines the future records and auditable formulas. Authentication, live data collection, metric calculations, billing, and workspace UI are **not implemented**.

Standalone modules implement website normalization/DNS preflight, a Firecrawl adapter tested with mocked transport (live crawling is unavailable), and deterministic CompanyProfile extraction from supplied `CrawlResult` data. Profiles retain exact supporting text, unknown fields, and conflicting claims; they are not connected to either route. Local tenant migration and pgTAP files are drafts with database verification/deployment still pending. See [ARCHITECTURE.md](ARCHITECTURE.md) for implemented boundaries and remaining prerequisites.

## Run locally

Use Node 24 (recorded in `.node-version`) and npm 11.17.0.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. No credentials or environment variables are required. On Windows PowerShell use `npm.cmd` and `npx.cmd` if the `.ps1` wrappers are blocked; do not change machine execution policy.

## Verify

```sh
npx playwright install chromium
npm run verify
npm audit
```

`verify` checks formatting, lint, strict types, production build, Node unit/security tests, and desktop/mobile browser tests including automated accessibility checks. Browser tests run the production build on loopback port 3100 and manage its lifecycle. Database tests are separate. See [TESTING.md](TESTING.md) for scope and limitations.

## Read before building

| Document                                               | Purpose                                           |
| ------------------------------------------------------ | ------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                 | Master coding contract                            |
| [docs/product-scope.md](docs/product-scope.md)         | Source of truth, assumptions, smallest next slice |
| [DESIGN.md](DESIGN.md)                                 | Active visual system and evidence UX              |
| [ARCHITECTURE.md](ARCHITECTURE.md)                     | Boundaries and decisions                          |
| [SECURITY.md](SECURITY.md)                             | Threat model and security gates                   |
| [CODE_STYLE.md](CODE_STYLE.md)                         | TypeScript and code conventions                   |
| [TESTING.md](TESTING.md)                               | Test strategy and commands                        |
| [OPERATIONS.md](OPERATIONS.md)                         | Local setup, deployment, incidents                |
| [docs/agent-skills.md](docs/agent-skills.md)           | Installed tools, sources, trust review            |
| [docs/foundation-report.md](docs/foundation-report.md) | Foundation deliverables and verification evidence |

The foundation is committed on [GitHub](https://github.com/vineetkpe/NestedWeb) at `b13a11e`. Its [hosted foundation checks passed](https://github.com/vineetkpe/NestedWeb/actions/runs/34078930882). No deployment has been created. The existing `.vscode/mcp.json` remains intact and local.
