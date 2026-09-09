# Company-profile reconciliation and completion plan

**Goal:** Reconcile current implementation status, then close evidence/validation gaps in the existing CompanyProfile extractor only.

**Architecture:** Reuse the pure application service, domain types, CrawlResult contract, and Node tests. No new integration, dependency, route, or agent workflow.

**Spec:** Current user request; AGENTS.md; ARCHITECTURE.md ADR-009; SECURITY.md; TESTING.md. Level 2 preparation with existing prerequisites still outstanding.

- [x] Inspect clean Git state, implementation, callers, contracts, security/testing docs, and historical handoff. Existing implementation is committed at `90ee6f9`.
- [x] Reconcile AGENTS.md, README.md, product scope, scanning architecture, and architecture/security summaries. Preserve dated historical verification records as historical evidence.
- [x] Audit the existing supported, unknown, conflicting, and malformed paths. Add regressions for concrete extraction/validation gaps before changing production code; run `node --conditions=react-server --test src/application/company-profile.test.ts` and observe the expected failures.
- [x] Make the smallest fixes in `src/application/company-profile.ts`, adjusting `src/domain/company-profile.ts` only for the extraction method version if interpretation changes. Preserve exact source references and existing field names.
- [x] Run the focused tests, review the actual diff and security boundaries, then run `npm.cmd run verify`, `npm.cmd audit`, and `git diff --check`. Record actual results and limits here; database/UI implementation is unchanged.
- [x] Stop without committing, pushing, enabling crawling, or starting the next scanner task.

## Findings and focused verification

The existing service already supplies strictly typed company name, product name/primary product, short description, audience, industry/category, use cases, capabilities, and qualified geography fields. Each candidate requires a nonempty evidence tuple. Unknown and conflicting states are explicit. No production caller, crawler invocation, LLM, database, or UI integration needed adding.

Two gaps were reproduced before fixes: any string failure code was treated as a valid crawl failure, and `Our company provides Unknown.` was incorrectly confirmed because placeholder validation saw the full sentence instead of the captured value. The initial focused run had 61 passes and five expected failures. The corrected service checks failure codes exhaustively against `CrawlResult` and validates captured sentence values before preserving descriptions. Method version advances to `company-profile-v2` because the interpretation changed.

The focused rerun passed all 66 tests (56 existing, 10 added). Added checks also preserve product/description conflicts and their page evidence, cover all current crawler failures, and demonstrate that instruction text inside an eligible claim remains inert data. Live crawling remains unavailable.

## Final verification — 2026-09-09

- `npm.cmd run verify`: exit 0. Formatting, lint, strict TypeScript, production build, 345 unit/security tests, and 10 desktop/mobile Chromium tests passed. Browser checks include keyboard, reflow, and automated accessibility.
- `npm.cmd audit`: exit 0; zero vulnerabilities. No dependencies or lockfile changed.
- `git diff --check`: exit 0. Reviewed the actual source/test/documentation diff and this new plan. Existing working tree was clean; unrelated source, UI, database files, and editor configuration were preserved.

No blockers remain for this bounded extraction task. Existing browser `NO_COLOR`/`FORCE_COLOR` warnings remain. No manual browser inspection was added because no UI changed. Database tests were not run: this change has no database dependency, and the earlier local database verification remains unresolved rather than claimed as passing. No live crawl, LLM call, database integration, billing, dashboard, commit, or push occurred.

Limits remain the documented narrow English grammar and source-claim semantics: unsupported prose stays unknown; explicit website claims are not independently verified truth. Callers must retain the supplied CrawlResult to resolve local page indexes and UTF-16 evidence spans. No further scanner task is started.
