---
"@rizom/brain": patch
---

Studio no longer redirects the retired `/cms`, `/account` and `/admin` addresses, so those paths are free for a site or another plugin, and Studio can be mounted at any of them. Old bookmarks to those addresses now get a 404; Studio lives at its configured path, `/studio` by default.
