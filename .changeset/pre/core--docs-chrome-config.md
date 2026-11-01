---
"@brains/docs-chrome": patch
"@brains/doc": patch
"@brains/guide": patch
"@rizom/brain": patch
---

Docs and guide pages no longer carry the Brains documentation site's branding on every brain. The docs index opened on "Handbook · Brains docs" and "Build, run, and publish brains.", its head described every brain's docs as "Brains documentation", and every docs and guide page drew a fixed "brains docs" header with Guides, Roadmap, GitHub and "Get Brains" links and a rizom.ai footer — over a site's own header, on sites whose layout brings one. Now the docs index opens on plain "Documentation" and the pages draw no header or footer brand of their own.

A brain whose docs pages are the whole site sets them in its plugin config: `plugins.docs.hero` (`label`, `title`, `accent`, `lead`), and `plugins.docs.chrome` and `plugins.guides.chrome` (`brand` with an optional `wordmark`, header `links` with an optional `area` marked current on that area's pages, a `cta`, and a `footer` with its own `brand` and `links`). The Brains documentation site keeps its look by setting these to its current copy.
