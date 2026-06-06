---
"@rizom/brain": patch
---

Harden OG image rendering: omit the social-preview meta tag when an image would only resolve to an unusable data: URL, render OG images only via the explicit source-attachment path (a plain prompt is always a normal cover-image request), and replace the source-image render's delete-then-create with an in-place update so a failure can't leave an entity with no image. Also consolidate the per-entity OG image providers onto one shared render helper.
