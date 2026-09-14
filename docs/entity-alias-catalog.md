# Entity alias catalog — D2

D2 introduces explicit, project-scoped entity aliases for later mention and recommendation analysis. The source of truth is an immutable alias catalog snapshot, not inferred website text or mutable matching state.

`entity-alias-v1` accepts exactly one company entity and optional product entities. Every alias is explicitly approved input. Normalization applies Unicode NFKC, Unicode lowercase, and internal whitespace collapse to one ASCII space. It does not remove punctuation or diacritics, expand synonyms, stem words, infer aliases from domains, or perform substring matching.

Each stored alias keeps its exact approved text and normalized value. If the same normalized alias belongs to distinct entities in one catalog, every occurrence is stored as `ambiguous`. Later detection must not silently resolve that alias to one entity. A duplicate normalized alias within the same entity is rejected because it would create duplicate match candidates without adding information.

Catalogs are immutable and keyed by project plus idempotency identity. Identical replay returns the original catalog and entity/alias IDs; conflicting replay fails closed. Authenticated workspace members may read catalogs through RLS. Creation goes through one authenticated RPC that derives the actor from `auth.uid()` and verifies workspace/project membership. Direct browser and service-role table writes are revoked.

This slice does not perform mention, recommendation, competitor, metric, provider, or UI work. D3 must bind any mention result to the exact alias catalog/method used so historical results remain reproducible when a customer later creates a different catalog snapshot.
