---
"@brains/plugins": patch
"@brains/entity-service": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

`defineEntity` now accepts the basic entity slots and seeds, and `@rizom/brain/entities` exports `EntityDefinitionConfig`, `EntitySeedDefinition` and `EntitySeedTrigger`. A declared entity can set its entity-type settings through `config` (search, projection sourcing, binary storage, default sort, Markdown import, retired and translated fields, containment, its minimum action policy and publish statuses), migrate stored metadata with `metadataFrom`, be a `singleton`, declare `hasBody`, `coverImage` and a `displayTitle`, enforce a persistence invariant with `validatePersist`, set its own action rule with `actions`, and plant a default record with `seed` once startup content settles, never overwriting an existing one. The retired-field registration check now also applies to a type whose metadata schema migrates stored values.
