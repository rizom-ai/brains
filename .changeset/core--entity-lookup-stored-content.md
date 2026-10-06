---
"@brains/entity-service": patch
"@brains/image-plugin": patch
"@brains/core": patch
---

Entity lookups by id, slug or title return stored content. The id lookup used a read that resolves `entity://image/...` references into data URLs, and its callers write the entity back: setting a generated or rendered image on a post, or a `system_update`, replaced an inline image reference in the post body with its bytes, in the database and in the synced Markdown file, and embedding then failed on the oversized body. `system_get` and `system_generate` now see a body's image references rather than its inlined bytes.
