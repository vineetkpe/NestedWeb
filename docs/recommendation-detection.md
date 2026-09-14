# Recommendation detection — D4

D4a defines the pure deterministic method `recommendation-detection-v1`. It consumes supplied answer text plus one already-proven positive D3 `mention` occurrence. It does not accept ambiguous D3 occurrences and performs no provider, network, sentiment, competitor, metric, or UI work.

Recommendation is intentionally stricter than mention. A brand being named, appearing in a neutral list, being compared with another option, or receiving unsupported positive wording does not count as a recommendation. Those cases remain `unknown`.

The method recognizes only a bounded set of explicit recommendation/selection cues (`recommend`, `choose`, `pick`, `try`, `go with`, `consider`, and explicit top/best/strong/good-choice phrasing) and explicit avoidance/negative-recommendation cues (`do not recommend`, `don't recommend`, `avoid`, `skip`, `not recommended`, and equivalent bounded forms). Negative phrases are evaluated separately so `do not recommend` cannot be misread as positive merely because it contains the word `recommend`.

If positive and negative cues conflict for the same mention, the state is `unknown`. If the sentence contains conservative qualification markers such as `might`, `may`, `could`, `perhaps`, `possibly`, `depending`, `unless`, `sometimes`, or conditional `if`, the state is also `unknown` rather than forcing a recommendation conclusion.

Positive `recommended` and negative `not_recommended` outputs include an exact UTF-16 source span from the original answer covering the explicit cue and the D3 mention. `unknown` carries no invented support span. The method validates that the supplied D3 mention span exactly slices the original answer and rejects malformed or ambiguous mention evidence.

Context is bounded to the containing sentence and at most 240 UTF-16 code units on either side of the mention. Answer text is bounded to 200,000 UTF-16 code units. The method never truncates a positive result or fabricates evidence outside those bounds.

D4b persists this interpretation only from immutable D3 evidence. A bounded service-only read RPC loads one exact raw observation plus the persisted positive D3 mention occurrences for one exact alias catalog. The application runs `recommendation-detection-v1` once for each positive mention in occurrence order; ambiguous D3 occurrences are never promoted into recommendation inputs.

Persistence is atomic per observation/catalog pair. `recommendation_detection_runs` records the complete classification set and therefore also records the valid zero-positive-mention case. `recommendation_detection_results` stores each exact D3 occurrence identity, entity/alias identity, classification state, and evidence span when the state is `recommended` or `not_recommended`. `unknown` must persist with no evidence span. The persistence RPC independently verifies that the submitted result set covers every and only persisted positive D3 mention occurrences, that result ordinals are ordered and unique, and that positive/negative evidence covers the exact mention span and contains the persisted mention source text.

Recommendation evidence is immutable and versioned. Identical replay is safe; a changed result set for the same observation/catalog/method conflicts. Authenticated workspace members receive read-only RLS access. Anonymous callers and browser/service roles receive no direct table writes; the service role can use only the narrow read/persist RPCs. D4 does not infer competitors, sentiment scores, aggregate metrics, citation support, or ranking scores.
