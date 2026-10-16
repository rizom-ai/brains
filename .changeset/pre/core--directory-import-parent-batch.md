---
"@rizom/brain": patch
---

Fix directory imports and orphan cleanup failing with “Projection batch cannot join active batch” when executed as children of a queued sync. Carry the durable root batch identity through the inner DirectorySync operations instead of generating a conflicting callback batch ID. Keep coordinator identity fencing and standalone callback batches unchanged.
