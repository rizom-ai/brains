---
"@brains/plugins": patch
"@brains/sdk": patch
"@brains/entity-service": patch
---

The ordinary services entry stops publishing runtime internals

Three things this branch added reached `@rizom/brain/services`, which the
published-surface check treats as private to normal authoring: the console
registration shapes a host keeps, and the entity-service client the mirror was
picked from.

The registration types and the mirror now sit on `@rizom/brain/plugins`, the
advanced consumer-backed entry, with Studio, Dashboard and directory-sync named.
`EntityMirrorClient` is written out as its own interface rather than picked from
`EntityServiceClient`, so the public contract no longer changes when the
internal service does, its overloads survive, and the internal type is no longer
emitted into the public declarations. `DeleteEntityRequest` is exported from
`@brains/entity-service` because that contract now names it.

The export ledger also listed `DataSource` and `BaseDataSourceContext` twice,
as stable and as internal, which the classification check rejects.
