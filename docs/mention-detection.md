# Mention detection — D3

D3a defines the pure mention-detection method `mention-detection-v1`. It consumes supplied answer text plus a projection of one immutable D2 `entity-alias-v1` catalog. It performs no database, provider, network, recommendation, sentiment, competitor, citation-support, or ranking work.

A positive mention means only that one explicit `eligible` alias occurs in the answer under the documented matching rules. `ambiguous` D2 aliases never resolve to an entity. When an ambiguous normalized alias occurs, the detector emits one ambiguous occurrence with the exact source span and the catalog-ordered candidate entity/alias IDs.

Matching applies the same compatibility semantics used by D2 aliases: Unicode NFKC, Unicode lowercase, and whitespace-run collapse to one ASCII space. Punctuation and diacritics remain significant. The detector builds a normalization-to-source map and emits UTF-16 offsets into the original answer, not offsets into normalized text. Compatibility expansion such as `ﬃ` → `ffi`, canonical composition, Unicode whitespace collapse, and astral characters therefore retain the exact original source text and offsets. If a normalized view cannot be mapped safely back to the source, detection fails closed.

For aliases whose first or last normalized code point is a Unicode letter, number, or mark, the corresponding outside edge must not touch another letter, number, or mark. This prevents arbitrary substring matches such as `Acme` inside `SuperAcme`, `Acme2`, or `2Acme`. Punctuation remains part of the exact alias; the method does not strip or rewrite it.

At a normalized source position, overlapping candidates are deterministic: candidates are ordered by longest normalized alias first, then by stable catalog order. Once an occurrence is emitted, scanning resumes after that occurrence, so evidence spans do not overlap. The method is bounded to 200,000 UTF-16 code units of answer text, the D2 catalog limits, and 2,000 occurrences; it fails rather than truncating evidence.

D3a does not persist results or read raw observations itself. A later D3 slice must project a persisted D2 catalog into this exact input contract, read persisted answer text, link results to the exact raw observation/catalog IDs, and persist the exact spans without changing the meaning of `mention` or `ambiguous`.
