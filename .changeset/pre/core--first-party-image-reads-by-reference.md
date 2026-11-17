---
"@rizom/brain": patch
---

First-party code no longer asks for an image's legacy data-URL form, so a migrated brain's `legacyBinaryContent` count in `system_status` stays at zero. A deck's cover slide encodes its cover from the image's bytes; `system_search` over images, `system_update`'s read-back (whose confirmation of an image change now names the changed fields instead of quoting its bytes), `system_create`'s id check, the stock-photo import, web chat's artifact-card access check and Studio's activity feed read images as their stored reference; and the `entity://{type}/{id}` resource still returns an asset-backed record as a data URL, encoded from its bytes. Built sites and resource output are unchanged.
