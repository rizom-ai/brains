---
"@brains/contracts": patch
"@brains/site-engine": patch
"@brains/webserver": patch
"@brains/dashboard": patch
---

Every brain's pages carry the lantern as their icon. The default icon lives in the contracts; the console page links it; the webserver answers `/favicon.svg` with it when the served output has no icon of its own, and no longer stamps a year's immutable caching on a 404 for an image or icon path, which had let an edge hide the file long after it existed.
