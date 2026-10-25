---
"@rizom/brain": patch
---

Site sections read their saved content raw, so an image in a section's content reaches the site as its `entity://image/<id>` reference, and the site renders the image the build writes, instead of receiving it inlined as a data URL. The scoped read view a site build uses now also scopes raw lookups.
