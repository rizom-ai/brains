---
"@brains/sdk": patch
"@rizom/brain": patch
---

`@rizom/brain/entities` no longer exports the alpha entity-service types `BaseEntity`, `EntityInput`, `EntityMutationResult`, `FrontmatterConfig`, `ListOptions`, `PaginateOptions`, `PaginateResult`, `PaginationInfo`, `SearchOptions` and `SearchResult`, which no declarative package uses; a definition's records are `EntityOf` the definition. Every stable entity name now has a fixture that uses it.
