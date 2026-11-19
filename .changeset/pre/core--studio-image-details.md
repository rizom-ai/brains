---
"@brains/studio": patch
"@rizom/brain": patch
---

Studio opens the image an image field refers to, with its preview, title and alt text, and says who wrote the alt text: not described yet, the brain's vision model, or you. Saving makes the alt text the owner's, so the brain never replaces it. The editor reads and saves through `GET` and `PUT /studio/api/image-details`, which leave the image's bytes as stored and refuse a save against an older version.
