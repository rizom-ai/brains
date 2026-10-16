---
"@rizom/brain": patch
---

Keep remote Git deletions authoritative by suppressing late entity exports until targeted delete jobs complete, reconciling files that survive a remote delete/modify merge, and covering concurrent cleanup in the packaged import-burst soak.
