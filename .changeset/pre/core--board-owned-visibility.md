---
"@rizom/brain": patch
---

A shared action item written by conversation memory no longer counts as edited on the board just because its file records its visibility: the entity service's own fields, now one exported list (`ENTITY_SYSTEM_FIELDS`), are ignored when telling a card the board owns.
