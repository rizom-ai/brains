---
"@rizom/brain": minor
---

**Breaking (plugin API):** `EntityAdapter` now requires a `purpose: string` — one declarative sentence describing what the entity type is. Any plugin that defines an adapter (via `BaseEntityAdapter`'s config or an `EntityAdapter` object literal) must add `purpose` or it will not compile.

System instructions now render the available entity types from each adapter's `purpose` instead of hardcoded "phrase → entityType" example mappings, so the model selects `entityType` from what each type is for. Migration: add `purpose: "<one sentence>"` next to `entityType` in your adapter config.
