---
"@rizom/brain": patch
---

A cover or social card written into a declared entity type's frontmatter — by `system_update`, the image render job or the publish pipeline's asset — now lands in its metadata in the same update, including when it replaces one the metadata already held, instead of reading stale until the next import.
