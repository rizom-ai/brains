---
"@rizom/brain": patch
---

Site runtime scripts that the build serves itself now load from a content-fingerprinted src (`/scripts/homepage-atlas.js?v=…`). A release that changes a script reaches visitors on their next page load instead of after the four-hour browser and CDN cache runs out.
