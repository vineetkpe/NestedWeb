# Agent skills and tooling

Reviewed and installed on 2026-09-07. Eleven project-local skills in `.agents/skills` plus existing user-level `find-skills`. Skill instructions are dependencies with agent-level capabilities, not a safety guarantee. No third-party skill received credentials or production data.

## Installed skills

All eleven installed `SKILL.md` files were compared with the reviewed source and match after newline normalization. `skills-lock.json` records upstream source and content hashes. Reviewed source revisions are listed below. The skills CLI's commit-URL install attempted a branch clone and failed; installation used named repositories, followed by comparison with the reviewed revision. Vendored files are the reproducible snapshot; do not claim CLI updates are pinned to those revisions.

| Skill                              | Source repository                                                       | Use and reason                                                              | Overlap / trust consideration                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `frontend-design`                  | [anthropics/skills](https://github.com/anthropics/skills)               | Intentional visual hierarchy when adding UI                                 | DESIGN.md overrides generic aesthetic advice; no unrequested placeholder content                                           |
| `shadcn`                           | [shadcn-ui/ui](https://github.com/shadcn-ui/ui)                         | Official component composition and accessibility when components are needed | Complements frontend-design; CLI/registry code must be reviewed, no bulk component installs                                |
| `playwright-cli`                   | [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) | Browser inspection and reproducible interaction guidance                    | Chosen browser skill; use pinned local Playwright for tests; auth state, requests, and traces may expose secrets           |
| `verification-before-completion`   | [obra/superpowers](https://github.com/obra/superpowers)                 | Evidence before completion claims                                           | Complements tests/review; never pretend a missing suite passed                                                             |
| `writing-plans`                    | [obra/superpowers](https://github.com/obra/superpowers)                 | Break substantial changes into concrete reviewable steps                    | Planning only; do not add a plan for trivial edits or force commits/worktrees contrary to user scope                       |
| `executing-plans`                  | [obra/superpowers](https://github.com/obra/superpowers)                 | Execute an agreed plan with checkpoints                                     | Complements planning; references optional Superpowers workflows not installed here, use available tools and project rules  |
| `systematic-debugging`             | [obra/superpowers](https://github.com/obra/superpowers)                 | Reproduce and isolate root cause before changing code                       | Existing engineering debug plugin overlaps; choose one per task. Never copy sample environment dumps into real diagnostics |
| `requesting-code-review`           | [obra/superpowers](https://github.com/obra/superpowers)                 | Independent bounded review of completed substantial work                    | Existing engineering review overlaps; do not stack reviews. Unborn repo has no commit range: review actual working files   |
| `test-driven-development`          | [obra/superpowers](https://github.com/obra/superpowers)                 | Test-first domain/security fixes                                            | Follow pragmatic TESTING.md; no deleting existing work or permission ritual for configuration changes                      |
| `supabase`                         | [supabase/agent-skills](https://github.com/supabase/agent-skills)       | Official auth, grants, RLS, and migration guidance for the next slice       | Operational guide; no remote SQL or credentials in this phase; verify current docs before use                              |
| `supabase-postgres-best-practices` | [supabase/agent-skills](https://github.com/supabase/agent-skills)       | Query/schema/index/RLS review when DB work exists                           | Complements operational Supabase skill; avoid speculative indexes/optimizations                                            |

### Reviewed source revisions

| Repository               | Revision                                   | Reputation snapshot                                     |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------- |
| anthropics/skills        | `41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f` | Official Anthropic; 174,833 stars                       |
| microsoft/playwright-cli | `655530f6d0dc71a0d6bf46ae165877d3c7311099` | Official Microsoft; 13,115 stars                        |
| obra/superpowers         | `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` | Established independent workflow project; 282,360 stars |
| shadcn-ui/ui             | `5c7072da672b0048bc6771e3204063a2537df91a` | Official shadcn; 123,206 stars                          |
| supabase/agent-skills    | `8331f910845103c08d51f6ca1d86ebb7d1f745e3` | Official Supabase; 2,581 stars                          |

Popularity informed selection but did not replace reading. Source metadata came from GitHub; the skills.sh leaderboard and CLI search were also inspected. CLI risk summaries were mixed: Playwright was marked High Risk by Snyk, shadcn and Supabase Medium; other shown scanners disagreed. These are advisory labels, not a clean bill of health. Browser tools can execute scripts, inspect cookies, and operate arbitrary sites, so keep them scoped to authorized tasks and never use a personal browser profile for tests.

## Evaluated and deliberately not duplicated

| Candidate                                                                       | Decision                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nextjs-shadcn` (laguagu/claude-code-nextjs-skills; search showed 771 installs) | Prefer official shadcn plus framework-bundled documentation; no overlapping community wrapper                                                                                                                                                   |
| `next-best-practices` (vercel-labs/next-skills)                                 | Retired upstream. Repo inspection and CLI listing found no skills; Next.js 16.3 ships version-matched docs under `node_modules/next/dist/docs`. AGENTS.md points there. [Upstream migration notice](https://github.com/vercel-labs/next-skills) |
| `agent-browser` (vercel-labs/agent-browser)                                     | Reviewed discovery stub. Duplicates chosen Playwright browser workflow and would add another executable/browser state system; defer                                                                                                             |
| `webapp-testing` (anthropics/skills)                                            | Reviewed. Recommends Python Playwright/server wrapper; Python unavailable and native TypeScript Playwright already supplies server lifecycle, fixtures, screenshots, traces. Defer duplicate runtime                                            |
| `differential-review` (trailofbits/skills)                                      | Reviewed reputable security candidate; explicitly excludes greenfield projects without a diff baseline. Use existing engineering security review now; reconsider after security-sensitive history exists                                        |
| Additional architecture/code quality collections                                | Existing engineering architecture/review skills are available; no extra collection needed                                                                                                                                                       |
| `find-skills` (vercel-labs/skills)                                              | Already installed at user level in `C:/Users/Vineet/.agents/skills/find-skills`; reviewed and reused, not copied again. New developers can install it if discovery is needed                                                                    |

The general skill-installer Python helper was inspected but Python is unavailable. Used the requested skills CLI (`npx.cmd --yes skills@1.5.23`) instead. Project installation used `add <repo> --skill <explicit names> --agent codex --copy --yes`; no `--all` or global skill installation.

## Updates and use

Upstream license notices for Microsoft Playwright (Apache-2.0), Superpowers, shadcn, and Supabase are preserved under `docs/reference/*.LICENSE`; frontend-design carries its own `LICENSE.txt`. These notices apply to vendored material, not a newly chosen license for this private application.

Vendored skills work without reinstall. To review inventory: `npx --yes skills@1.5.23 list --json`. Before an update read source changes including references/scripts, compare with project rules, update only the selected skills, and review `skills-lock.json` plus vendored diff. Do not run blind bulk updates. Skills CLI telemetry/security services may receive public package metadata; never pass customer data through CLI metadata flags.

Skills are available on the next turn. Supporting scripts and referenced workflows are not automatically authorized or installed merely because SKILL.md mentions them. Source review is not exhaustive security certification. Product and repository requirements prevail over generic instructions to commit, install, delegate, stop, or discard code.

## Ponytail

Installed using the official commands:

```sh
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
codex plugin list --marketplace ponytail --json
```

Verified installed/enabled version **4.9.0**, source [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), at `C:/Users/Vineet/.codex/plugins/cache/ponytail/ponytail/4.9.0`. Its SKILL.md, plugin manifest, activation/runtime/config/mode-tracker code, and hook declarations were inspected. It supplies minimalism instructions and lifecycle hooks; hooks track mode in local state and can write local Ponytail configuration on explicit mode commands. Default mode is `full`; no additional configuration is required.

Installation/enabled state is confirmed, and Ponytail skills appeared in the refreshed session catalog. An isolated Codex SessionStart invocation passed: default mode `full`, exit 0, valid `PONYTAIL:FULL` output and instruction context, using temporary project-local state. Actual automatic lifecycle activation in a newly started Codex thread remains a separate check. No unrelated Claude status-line configuration was changed. AGENTS.md records the minimalism ladder and its mandatory safety exceptions so the project does not depend on a hook for correctness.

## Design generator provenance

`getdesign` resolved to 0.6.25 from VoltAgent/awesome-design-md; it is distinct from the similarly named `@getdesign/cli`. Requested Airtable command succeeded. Original file SHA-256: `1D225E511213044D3C705BDE50265AD010932BFD8A15740A144DD4F480128889`. Archive in `docs/reference/airtable.generated.md`; active adapted contract is root DESIGN.md. Do not rerun with `--force` over the adapted file. Generate future references to a separate explicit path and review them.
