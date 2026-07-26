---
"@brains/contracts": patch
"@brains/site-engine": patch
"@brains/site-builder-plugin": patch
"@brains/blog": patch
"@brains/webserver": patch
---

Render site builds into isolated generation directories, validate a complete artifact manifest, and publish successful generations through an active-output symlink. Preserve the previous site on renderer, validation, and pointer-switch failures. Generate RSS and SEO files in staging so post-build events do not mutate committed generations. Snapshot binary app `public/` files during preparation within a bounded size budget and account for them explicitly in the artifact manifest. Stamp the one-time migration backup at migration time and retire it through the stale sweep once a committed generation exists to roll back to. Cancel superseded and shutdown builds across preparation, image work, rendering, CSS, assets, and SEO without interrupting an admitted output commit. Preserve each environment's configured public URL in staged RSS, robots, and sitemap output. Hash every committed artifact, derive sitemap timestamps from the prepared snapshot, and remove stale uncommitted generations safely. Keep the manifest out of the public site: omit build warnings from the persisted file and refuse to serve dotfiles from site output.
