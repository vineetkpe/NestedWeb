# Company-profile extraction implementation plan

**Goal:** Build only a deterministic, evidence-backed company-profile interpretation of existing crawl results.

**Architecture:** Domain types represent unknown, confirmed, and conflicting fields. A pure application service validates supplied crawl results, recognizes explicit first-party statements, and returns evidence spans without changing raw observations.

**Tech stack:** Existing strict TypeScript and Node test runner; native string/URL operations; no dependencies.

**Spec:** User's company-profile-only requirements, ARCHITECTURE.md ADR-009, SECURITY.md, TESTING.md, and docs/report-specification.md.

## Bounded task and interfaces

- Create `src/domain/company-profile.ts`: `CompanyProfile`, `ProfileField`, supported values, and exact evidence reference types. All fields carry states; confirmed values and conflicting candidates carry evidence.
- Create `src/application/company-profile.ts`: `extractCompanyProfile(input: unknown)` returns a profile or a safe invalid/oversized/crawl-failed result. A `CrawlResult` is a valid input; failed crawls never masquerade as sparse successful crawls.
- Create `src/application/company-profile.test.ts`: deterministic test-only SaaS, sparse, conflict, missing, and adversarial fixtures; actual Firecrawl-normalizer composition; exact spans, immutability, bounded validation, and inert content.
- Update architecture/security/testing documentation with the actual grammar, guarantees, and limitations.

## Extraction contract

Fields: `companyName`, `productName`, `shortDescription`, `primaryProduct`, `targetAudience`, `industry`, `keyUseCases`, `capabilities`, and `geography`. Each confirmed field contains supported `values`; conflicting scalar fields contain all candidate values. Repeated exact values consolidate references. Collection fields accumulate independently stated values, without treating different use cases or office locations as contradictions. Differing headquarters claims make geography conflicting and retain all candidates for review.

Recognize standalone labels: `Company name:`, `Product name:`, `Short description:`, `Primary product:`, `Primary service:`, `Target audience:`, `Target customers:`, `Industry:`, `Category:`, `Use case:`, `Capability:`, `Headquarters:`, `Service area:`, and `Office location:`. Geography retains its label so an office is never converted into a headquarters or market. Simple bold labels and unordered-list label lines are accepted.

Also recognize explicit first-person forms: `Our company is called ...`, `Our product is called ...`, `Our company provides ...`, `Our primary product is ...`, `Our primary service is ...`, `Our target customers are ...`, `Our industry is ...`, `Our use cases include ...`, and `Our capabilities include ...`. Capture the stated value only, without decomposing free prose or comma-separated lists. `Our company provides ...` supports a short description by retaining the full statement, not an inferred category or primary product.

Only root content and explicitly first-party sections (`About us`, `Our company`, `Our product`, `Our services`, `Who we serve`, `Our use cases`, `Our capabilities`, `Our locations`, `Company profile`) are eligible. ATX and Setext headings are recognized. Unknown heading sections and their descendants are excluded until a heading returns to an eligible scope. Ambiguous prose, quotations, and indentation exclude subsequent text across blank lines until a new eligible unindented heading. Fenced/indented code, quotations, Markdown links/images, inline emphasis/strikethrough, HTML/entities, control/format characters, and empty/placeholding values do not establish fields. Fence recognition precedes other context parsing, including 0–3-space indented and unclosed fences. HTML/entity-bearing Markdown excludes the entire page's content. Metadata title/description/language and domain spellings are not identity or geography evidence. Values remain plain untrusted strings, never executable instructions or rendered HTML.

Bounds: at most 20 pages, 2 Mi UTF-16 code units total supplied text, 2,000 code units per parsed Markdown line (checked before grammar regexes), and 200 supported statements per result. Exceeding bounds fails explicitly rather than silently returning a partial profile. Validate all page fields and same-origin HTTPS URLs before interpreting text. Preserve empty successful results as profiles with unknown fields. Evidence offsets index original Markdown with an exclusive end, including original CRLF and Unicode representation.

## Execution

- [x] Write fixture tests before implementation; run the focused suite to establish the missing-feature failure.
- [x] Implement the domain model, validation, statement grammar, evidence, and field aggregation; run the focused suite and typecheck.
- [x] Review risk coverage and actual diff, including independent code review; fix substantive findings with regression tests.
- [x] Run `npm run verify`, `npm run test:db`, `npm audit`, and `git diff --check`; record exact outcomes and limitations.
- [x] Stop without committing or starting another layer.

## Verification and handoff — 2026-09-09

Repository began clean at `d72ae7c`. Added the domain model, application extractor, and 56 deterministic fixture tests. Updated ARCHITECTURE.md, SECURITY.md, TESTING.md, and this plan. Existing crawler/normalizer/website-target contracts, package files, UI, and database files were preserved.

Initial tests failed because the service did not exist. Additional regressions reproduced geography placeholders/conflicts, Setext and customer-example context errors, unsupported inline markup, and indented code fences before their fixes. Independent read-only review identified the customer-context and inline-markup cases; its follow-up identified the fence-ordering regression, now covered by closed/unclosed-fence tests. Strict type checking initially caught redundant test guards after narrowing assertions; those guards were removed without suppressions.

- `npm run verify`: exit 0; formatting, lint, strict types, production build, all 335 unit/security tests (279 existing plus 56 new), and all 10 desktop/mobile browser tests passed.
- `npm run test:db`: exit 1 before SQL execution; `ECONNREFUSED 127.0.0.1:54322`. No database assertion passed or ran, and no remote database was contacted.
- `npm audit`: exit 0, zero vulnerabilities. No dependencies or lockfile changes.
- `git diff --check`: exit 0; reviewed the actual tracked diff and all new source/tests. Final handoff documentation also passed its targeted Prettier check.

Existing browser `NO_COLOR`/`FORCE_COLOR` warnings remain. No UI changed and no new manual browser inspection was performed. No live crawler, LLM, prompts, Supabase integration, scores, competitors, recommendations, authentication, billing, or UI were added. No commit created.

Limits: this is an explicit English statement extractor with deliberately low recall, not general company understanding. Metadata-only pages and unsupported prose/layouts return unknown. It cannot independently verify website claims or detect every semantic contradiction; differing literal scalar claims remain unresolved candidates. Collection values retain complete stated phrases rather than guessing how to split free prose. Exact raw crawl results must accompany profiles to resolve local evidence indexes/offsets. Live crawling and durable provenance remain separate prerequisites, not completed by this task.
