# AI visibility report — Task 03 specification

Version: `report-v1`. Status: report contract and empty UI prototype, not a populated customer report. No company or real AI observations were supplied. `/report` shows the intended structure without invented inputs, timestamps, citations, metric values, or advice.

## Purpose and implementation boundary

For one client company, help an agency answer: where did the brand appear, what did the answer actually recommend, which competitors and sources appeared, and what specific action does that evidence support? Follow [product scope](product-scope.md), [data methodology](data-methodology.md), and [DESIGN.md](../DESIGN.md).

Implement one static server-rendered report route, link it from the existing preview, and test navigation, honest unavailable states, keyboard access, reflow, and axe. Use native semantic sections and one metric table with existing design tokens. The data contracts below specify future input/output structures; they are not a database schema, API, runtime validator, metric engine, or claim that collection exists. No new dependency or generic report framework is needed.

The user explicitly authorized Task 03 despite incomplete individual interview/pilot documentation in [agency validation](agency-validation.md). [ADR-004](../ARCHITECTURE.md#adr-004-report-contract-before-the-data-pipeline) records this bounded sequencing decision. It does not establish payment validation or authorize the scanner.

## Report envelope and company

| Field                                                                                   | Contract                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specVersion`                                                                           | `report-v1`; changes to meaning require a new version.                                                                                                                                                                              |
| `reportId`                                                                              | Stable ID for an actual report; absent in the unconfigured prototype.                                                                                                                                                               |
| `state`                                                                                 | `unconfigured`, `awaiting_observations`, `partial`, or `ready`. `ready` means the declared collection/interpretation process completed, not that all claims are certain or metrics are nonzero.                                     |
| `company`                                                                               | When configured: `companyId`, `name`, original `websiteUrl`, validated normalized `domain`, versioned brand aliases, and explicit exact-host/subdomain matching scope. No inferred company from personal accounts or browser state. |
| `reportGeneratedAt`                                                                     | Actual generation timestamp in UTC; null before a report is generated. Display its time zone. Never use build time as an observation/report date.                                                                                   |
| `cohort`                                                                                | Versioned query IDs, selected provider/surface, model/config when disclosed, locale, observation window, explicit comparison brand set, and sampling policy.                                                                        |
| `queries`, `observations`, `citations`, `interpretations`, `metrics`, `recommendations` | Separate collections joined by stable IDs below. Empty collections are valid; absent evidence never becomes synthetic content.                                                                                                      |

No workspace/client storage is implemented. Future tenant-aware persistence must add the authorization and parent-integrity requirements in SECURITY.md before receiving private client records.

## Queries — planned is not executed

A query has `queryId`, `version`, `kind`, exact `text`, intended `locale`, and `state` (`planned` or `executed`). Execution requires linked observation/attempt records; retries do not silently create new planned samples. Freeze the cohort before comparing brands or historical reports. Query text naming the target brand is visibly disclosed because it changes the meaning of mention rates.

| Kind                    | Template only — replace bracketed terms before future execution |
| ----------------------- | --------------------------------------------------------------- |
| Category discovery      | Which platforms serve [category]?                               |
| Best tools/platforms    | What are the best tools for [buyer need]?                       |
| Alternatives            | What are alternatives to [brand]?                               |
| Comparison              | How does [brand] compare with [competitor] for [use case]?      |
| Use-case recommendation | Which platform fits [use case] for [team]?                      |
| Buyer intent            | Which [category] platform fits [budget] and [requirements]?     |

Templates in the prototype are examples of questions, not a real query cohort and not recorded executions. There is no run/scan control.

The standalone ADR-010 library now generates planned questions from supplied CompanyProfile v2 evidence, without populating this prototype. Its six category identifiers map to the kinds above; comparison is currently product-versus-category tools, since the profile has no supported named-competitor relationship. Missing or conflicting required fields omit a question. Templates use English with unspecified locale, stable local query IDs, versioned text, and profile field/value/evidence references. Retain the profile and crawl to resolve them. Generation is not execution, provider observation, durable storage, or a completed report cohort.

## Raw observation

Each future record contains `observationId`, `queryId`, `queryVersion`, exact `queryText`, `provider`, `surface` (API or named manual interface), nullable `modelVersion` (unknown if not disclosed), actual `observedAt` UTC, exact `rawResponse`, response digest, and `outcome` (`answered`, `refused`, `partial`, or `failed`). Preserve raw content independently of display/normalization. `rawResponse` is null if no response was received, not an invented explanation. A safe failure code belongs in a separate field.

Retain execution parameters, collector/source reference, provider request ID and usage if actually available, and the capture version. Manual collection must record where the response came from and its actual capture time. Never invent a model version or request ID. Missing/failed collection remains visible in coverage. An answer with no brand mention differs from no answer collected.

ADR-011 implements these observation fields only as a standalone Gemini boundary exercised through injected transport. `rawResponse` stores the complete decoded UTF-8 HTTP body; `responseDigest` is `sha256:` plus the hex digest of those UTF-8 bytes. `answerText` and `groundingMetadata` remain separate from that immutable raw text. `rawResponseState` distinguishes a complete body, no body received, and an explicitly discarded body. Oversized/unreadable/credential-bearing content is not retained or replaced with a made-up answer. `observedAt` comes from the execution clock when the attempt settles; it is not provider generation time. `captureMode: not_executed` identifies attempts stopped before transport; injected transport is not a live-result claim. The caller supplies a distinct observation ID per attempt and retains the planned query/profile/crawl. No report route or persistence consumes these records yet.

## Citations and evidence

Each citation contains `citationId`, `observationId`, original `citedUrl`, parsed `sourceDomain`, optional provider-supplied source title, `capturedAt` UTC, and `relationship` to the answer. Preserve the provider marker/quoted span or offsets when available; otherwise label the relationship `source_list_only` or `unknown`. Do not invent an association between a source and a claim.

The cited URL must have actually been returned with that observation. A separately discovered supporting document is separate evidence with its own provenance, never retroactively a provider citation. Store the original URL independently of a versioned display/deduplication form. Invalid/non-HTTP(S) or credential-bearing URLs remain inert raw text and are excluded from clickable links and eligible URL metrics with an explicit reason. External links use safe schemes and, if opened in a new tab, `noopener noreferrer`. No URL automatically triggers a fetch or link preview.

`verification` is `not_checked` unless a separate safe review actually checked the source. A returned citation does not prove factual support or truth. The prototype has no real source links, source titles, or timestamps.

## Normalized interpretation

Each interpretation has `interpretationId`, `observationId`, `methodVersion`, `processedAt`, `state` (`complete`, `partial`, `failed`), and findings. A finding has `kind`, `entityId` where resolved, exact supporting quote with start/end offsets into the raw response, a reason, and `certainty` (`supported`, `ambiguous`, `unknown`). All offsets use a documented unit in the parser version and must reproduce the quoted span.

- **Brand/competitor mention:** resolve against the frozen entity/alias set. Repeated mentions in one answer count once per entity. Ambiguous names are not silently assigned.
- **Recommendation detection:** require a supported endorsement or selection for the query's needs. Mere naming, a comparison, or negative advice is not a positive recommendation. Preserve context and ambiguity.
- **Competitor:** distinguish an entity appearing in the answer from a separately reviewed claim that it competes with the company. Newly discovered candidates do not silently change the metric comparison set.
- **Sentiment/context:** use only where the response supports a clear, scoped reading. Otherwise label unknown. No global sentiment score; neutral mention does not imply satisfaction or commercial impact.
- **Cited source association:** link existing `citationId` values to supported spans/entities. Domain ownership and competitor association require evidence; a citation next to a name alone may be ambiguous.

Detection outcomes must distinguish supported positive, supported absence after completed analysis, and unknown. Reprocessing creates a new version and does not overwrite raw evidence. Product action recommendations below are separate from detecting that an AI answer recommended a brand.

## Auditable metric definitions

Proposed method version: `report-metrics-v1`; formulas specified here, not calculated by the prototype. Each metric returns either `unavailable` with a reason or `measured` with `value`, `unit`, `numerator`, `denominator`, eligible observation/interpretation IDs, per-observation contributions, exclusions with reasons, cohort/method versions, and actual calculation time. Competitor Gap retains both component counts. Do not create numeric result fields for an unavailable metric.

Use one predeclared sample per planned query/configuration, deduplicate transport retries, and publish collection coverage alongside metric eligibility. An independently planned repeat must be declared before collection. Exclude failed/refused/truncated or unresolved analyses as required by each metric and report how many and why; exclusions must not disappear. Zero eligible denominator means unavailable, never 0%. Display precision is rounding only; retain exact counts.

| Metric              | Formula and scope                                                                                                                                                                                          | Interpretation limit                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mention Rate        | 100 × eligible answers with a supported target mention / answers with completed, unambiguous target mention analysis.                                                                                      | Count target once per answer. An analyzed absence contributes zero; unknown is excluded and disclosed.                                                                                                                                                                                                                                                     |
| Recommendation Rate | 100 × eligible answers with a supported positive target recommendation / answers with completed, unambiguous target recommendation analysis.                                                               | Mention alone does not count. Disclose endorsement method and exclusions independently of mention eligibility.                                                                                                                                                                                                                                             |
| AI Share of Voice   | 100 × target answer-level mentions / sum of answer-level mentions for all brands in the frozen target-plus-competitor set, using answers with completed unambiguous analysis for every compared brand.     | Each brand counts at most once per answer; multiple brands can contribute. Zero total mentions is unavailable. This is share of sampled brand mentions, not market share or share of all AI answers.                                                                                                                                                       |
| Citation Share      | 100 × eligible cited URL occurrences matching the tracked company domain scope / all eligible cited URL occurrences, deduplicated by normalized URL within each observation.                               | Eligible means actual returned HTTP(S) citation with completed extraction. Preserve path/query, lowercase scheme/host, remove fragment and default port under the declared normalization version. Same URL in different observations counts again. No eligible citations means unavailable. It measures cited URLs, not answers or verified claim support. |
| Competitor Gap      | For each named competitor: 100 × (competitor-positive answers − target-positive answers) / shared eligible answers, using completed unambiguous recommendation analysis for both. Unit: percentage points. | Positive means the competitor was recommended more often in this cohort. Store both counts and shared IDs. It is a recommendation gap, not an inferred ranking or causal lost-revenue claim.                                                                                                                                                               |

Metrics have different eligible cohorts; show them explicitly rather than treating all denominators as interchangeable. Share of Voice excludes unresolved compared entities consistently. Citation Share normalization must preserve raw URLs and be tested before calculation. Comparison sets, aliases, locale, models, and query mix cannot change silently between reports. One report does not establish a trend or statistical significance. See [data methodology](data-methodology.md) for additional limits.

## Evidence-based customer recommendations

Each record has `recommendationId`, `action`, `reason`, `target`, `expectedImpact` (hypothesis plus basis and uncertainty), `effort` (estimate plus basis, or unknown), `priority` (with rationale), `evidenceRefs` (observation, citation and/or interpretation IDs), optional `metricRefs`, `methodVersion`, `createdAt`, limitations/contradictions, and review state.

The action must address a specific supported finding for the named company, page, or question. The reason explains the evidence-to-action inference; citations alone are not a causal case. No generic SEO checklist, promised lift, invented effort estimate, or recommendation generated merely because a metric is low. If no supported action exists, state that. Findings may be useful even when no action is justified.

## Prototype acceptance and next pipeline boundary

- Company name/domain remain unconfigured and report date remains "Not generated" until real inputs exist.
- All six query categories are explicitly unexecuted templates. Raw observations, citations, interpretations, and recommendations each have their own honest empty state.
- All five named metrics show "Not measured" with a plain-language definition; there are no fake values, report IDs, timestamps, source links, competitor names, or actions.
- Native anchors, headings, description lists and metric table work with keyboard, desktop/mobile, and 320px reflow. Existing preview and response headers remain functional.
- Future population requires actual company details and captured answers/citations, validated record references and URLs, versioned interpretation with evidence spans, tested metric calculations, and reviewed recommendations. Implement no import form or data path until those boundaries can be tested.
- No Supabase, auth/RLS, crawling/API integration, jobs, billing, or deployment. Task 04 is not started.
