---
"@brains/directory-sync": patch
---

Directory sync exports asset-backed images from their stored chunks instead of materialized data URLs: the durable export dispatcher, batch export and orphan cleanup read asset references, an unchanged file is detected by comparing its streamed SHA-256 with the reference digest, and a changed image is streamed to disk chunk by chunk. Imports of binary entity types no longer scan their content for markdown images, which blocked the event loop for seconds on large images.
