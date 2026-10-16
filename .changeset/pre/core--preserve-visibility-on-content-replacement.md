---
"@brains/entity-service": patch
"@brains/core": patch
---

Stop silently publishing restricted entities when replacement content omits `visibility`.

`extractVisibilityFromMarkdown` used to collapse "the file declares no visibility" into `"public"`. Because export deliberately omits the key for public entities, absence is the ordinary shape of content rather than a demotion request — so any write path that merged parsed markdown over an existing entity would reset a restricted entity to public. It now returns `undefined` when the key is absent, and `deserializeEntity` leaves `visibility` unset in that case.

Directory-sync import and `system_update` content replacement both keep the stored visibility when the file declares none. Moving an entity between tiers now requires an explicit `visibility:` value in frontmatter; entities created from markdown with no visibility still default to public.
