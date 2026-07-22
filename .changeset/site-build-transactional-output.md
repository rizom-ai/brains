---
"@brains/site-engine": patch
"@brains/site-builder-plugin": patch
"@brains/blog": patch
---

Render site builds into isolated generation directories, validate a complete artifact manifest, and publish successful generations through an active-output symlink. Preserve the previous site on renderer, validation, and pointer-switch failures. Generate RSS and SEO files in staging so post-build events do not mutate committed generations. Snapshot binary app `public/` files during preparation and account for them explicitly in the artifact manifest. Cancel superseded and shutdown builds across preparation, image work, rendering, CSS, assets, and SEO without interrupting an admitted output commit.
