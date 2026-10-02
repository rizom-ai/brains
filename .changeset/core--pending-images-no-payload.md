---
"@brains/image": patch
"@brains/image-plugin": patch
"@brains/directory-sync": patch
"@brains/entity-service": patch
"@rizom/brain": patch
---

Pending and failed images store no payload. Until an upload or generation produces bytes, an image's content is empty and its metadata names no format or dimensions; a completed image must still carry them. Nothing renders or exports an image without bytes, and its existing file stays until the new bytes replace it. `brain assets:migrate` leaves such images alone and clears the 1x1 placeholder older ones still hold, `assets:verify` fails while one is left, and `assets:reconcile` never overwrites an image awaiting its bytes from an older file.
