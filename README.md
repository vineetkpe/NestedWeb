# AI Visibility OS

Agency-first, evidence-backed AI-answer monitoring: Measure → Explain → Recommend → Monitor.

**Current status:** substantial backend components exist; the customer product is not yet connected. `/` and `/report` remain static previews. Backend code covers auth/tenancy, projects, bounded crawling and Gemini calls, durable scans/cost reservations, evidence storage, citations, aliases, and mention detection. Recommendation classification has a pure core. Metrics, actionable customer recommendations, customer workflows, billing, and production delivery remain unfinished.

See [project progress](docs/project-progress.md) for what exists, what remains, and how completion is counted. [ARCHITECTURE.md](ARCHITECTURE.md) describes boundaries; [the security exit record](docs/security-exit.md) records historical database verification. Source code and historical checks do not prove a currently deployed working product.

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
