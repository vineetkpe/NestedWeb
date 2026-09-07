# AI visibility data methodology

Status: methodology contract for future implementation. No observations, metric functions, or recommendations exist in the current app.

## Four separate layers

| Layer                     | Meaning                                                                       | Required provenance                                                                                                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw observation           | What a provider actually returned, including absence/refusal/partial response | Tenant/project, attempt ID, exact query and version, input parameters/context, provider/model IDs, UTC execution times, provider request ID if supplied, raw payload or private object reference + digest, reported usage, capture schema version |
| Normalized interpretation | What our parser identifies as mentions/citations                              | Raw observation ID, parser version, extracted spans/offsets, original URL and display normalization, ambiguity flags, parse outcome, processing time                                                                                              |
| Derived metric            | A deterministic calculation over eligible interpretations                     | Formula/version, source observation IDs or reproducible selection manifest, query cohort, model/config, time window, numerator, denominator, exclusions, calculation time                                                                         |
| Recommendation            | An inference from evidence                                                    | Evidence/metric IDs, rule/model version, reasoning, limitations, confidence basis, contradictory evidence, generated time, review state                                                                                                           |

Raw evidence is immutable; reprocessing creates a new interpretation version. Preserve original URLs alongside normalized forms. A response citing a source means the provider returned that citation, not that we fetched it, verified support, or proved the statement true. Store a verification outcome only when a separate safe process actually verifies it.

## Initial candidate metrics (not implemented)

Choose one frozen cohort (queries, provider/model/config, project, time range). One eligible interpretation per planned observation; transport retries must not count as new samples. Record failed/refused/malformed/ambiguous observations separately.

- **Mention rate** = eligible answers with an unambiguous target mention / eligible answers for which mention detection completed. Repeated mentions within one answer count once. Brand aliases and ambiguity policy must be versioned.
- **Citation rate** = eligible answers with a provider-supplied citation matching the explicitly tracked domain scope / eligible answers for which citation extraction completed. Multiple matching citations count once per answer. Exact host/subdomain policy is explicit; `example.com.attacker.test` never matches `example.com`.
- **Collection coverage** = completed eligible planned observations / planned observations. Show it next to result metrics so provider failures cannot make visibility look artificially better.

Example fixture only: 2 matching answers among 5 eligible answers yields 40%, with numerator 2 and denominator 5 displayed. It is not product data. If denominator is zero return “not measured/unavailable,” not zero. A successfully parsed answer with no target mention is a real zero contribution; an unknown parse is excluded and counted in coverage. Incomplete coverage is visible and may bias estimates.

Never merge incomparable models, locales, time windows, or query mixes silently. Deltas need compatible cohorts and enough samples; label insufficient evidence instead of implying statistical significance. No universal confidence percentages or composite AI score. Define any uncertainty method with the future metric implementation and tests.

## Reproducibility and limits

Store seeds/temperature/retrieval settings when available; provider behavior can change despite a model label. Execution timestamps, response digests, and method versions support traceability, not guaranteed reproducibility. Mention/citation frequency describes sampled answers; it is not ranking, causation, traffic attribution, or a promise of future exposure.

Recommendations must distinguish observation (“the response cited source X”) from hypothesis (“clarifying this page may help readers”). No causal SEO/GEO improvement claim without a suitable study. Never use live provider output as trusted application instructions or executable code. Retention and sharing policy must be settled before storing customer prompts or exporting evidence.
