---
"@brains/contracts": patch
"@brains/site-engine": patch
"@brains/site-builder-plugin": patch
"@brains/blog": patch
"@brains/webserver": patch
---

Render site builds into isolated generation directories, validate a complete artifact manifest, and publish successful generations through an active-output symlink. Preserve the previous site on renderer, validation, and pointer-switch failures. Generate RSS and SEO files in staging so post-build events do not mutate committed generations. Snapshot binary app `public/` files during preparation within a bounded size budget and account for them explicitly in the artifact manifest. Stamp the one-time migration backup at migration time and retire it through the stale sweep once a committed generation exists to roll back to. Cancel superseded and shutdown builds across preparation, image work, rendering, CSS, assets, and SEO without interrupting an admitted output commit. Preserve each environment's configured public URL in staged RSS, robots, and sitemap output. Hash every committed artifact, derive sitemap timestamps from the prepared snapshot, and remove stale uncommitted generations safely. Keep the schema-complete build manifest out of the public site while continuing to serve legitimate dot-prefixed paths such as `/.well-known/` discovery and verification assets. Fail a build whose staged artifacts could not be written, so a swallowed RSS failure can no longer publish a generation with no feed, and reject a deployed production build that has no configured site URL instead of publishing sitemap, robots, and feed links against a placeholder domain. Use the runtime's explicit localhost URL for locally served builds so production-output verification still works without configuring a public domain.
