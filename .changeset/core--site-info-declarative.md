---
"@rizom/brain": patch
---

Site-info moved to `plugins/site-info` and is a declarative service that owns the `site-info` type. The type, its `site-info:entities` data source and the `siteInfo` defaults a brain gives under `plugins.site-info` are unchanged; its default record is still written after the initial sync, with the same bytes, and `site:metadata:get` is still answered in every process, with the site's title and description falling back to the brain or its anchor. Its frontmatter is now also its metadata, which startup re-derives for a site-info an earlier release wrote. The service half is the `site-metadata` plugin, and a configured default the site-info schema refuses now stops the brain from starting with an error naming the package.
