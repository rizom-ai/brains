---
"@rizom/site-smoke-canary": patch
---

Rebuild the smoke-canary as a minimal, content-independent site. Previously it re-exported the professional layout, so its homepage required a curated `site-info` (with a cta) and rendered empty on a bare instance. It now defines its own static homepage template — a single `/` route with no datasource — that renders the package's build metadata, proving the hosted site+theme package loaded, built, deployed, and styled without depending on any brain content. Built against the public `@rizom/brain/{site,plugins,templates}` surface.
