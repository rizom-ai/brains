---
"@rizom/brain": patch
---

Restating the sections' saved copy at start reads each copy as stored, so a section's image stays its `entity://image/<id>` reference. The restate read through the resolving lookup, which inlines every image as a data URL, and wrote those bytes back over the reference: a site's photo fields then held no image the build writes, and the photos went missing from the page.
