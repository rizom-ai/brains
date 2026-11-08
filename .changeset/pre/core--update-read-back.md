---
"@rizom/brain": patch
---

A confirmed `system_update` reads the entity back from storage after writing and shows what it now holds after the completion: the changed lines as stored, the lines an edit removed, or the fields that changed. A tool's success response can carry a `completionDetail` for what a confirmed action verified; the brain shows it beneath the completion summary.
