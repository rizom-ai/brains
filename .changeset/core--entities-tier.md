---
"@brains/sdk": patch
"@rizom/brain": patch
---

`@rizom/brain/entities` no longer exports the alpha entity-service types `EntityInput`, `EntityMutationResult`, `FrontmatterConfig`, `ListOptions`, `PaginateOptions`, `PaginateResult`, `PaginationInfo`, `SearchOptions` and `SearchResult`, which no declarative package uses. `BaseEntity` stays exported, as an advanced alpha contract, for packages written against the class API. Every stable entity name now has a fixture that uses it.
