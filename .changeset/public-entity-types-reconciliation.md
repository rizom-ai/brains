---
"@rizom/brain": patch
---

Reconcile the public plugin entity-service contract with the runtime entity-service types. Public `IEntityService` now constrains entity generics to `BaseEntity`, `search` returns `SearchResult<T>[]`, and list/search request options use the canonical `ListOptions` and `SearchOptions` shapes.

This is an alpha-phase breaking type tightening for external plugins that relied on unconstrained `<T = unknown>` entity-service generics.
