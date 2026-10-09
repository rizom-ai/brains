---
"@rizom/brain": patch
---

Entity URLs and citability come from one entity display, the one the shell resolves from the site, instead of a process-wide singleton the site builder configured and core read. `EntityUrlGenerator` is a plain value built from that map: core builds one for answer sources and AI content, the site builder and AT Protocol build theirs from the plugin context. The site builder no longer takes `entityDisplay` in its own config. A brain run from the monorepo, where the site builder loads from a separate bundle, now cites the same sources as a deployed one.
