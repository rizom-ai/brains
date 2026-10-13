---
"@brains/studio": patch
"@rizom/brain": patch
---

Restore ordinary no-op saves for existing System documents without weakening Groupings draft guards. Pristine singleton creation and unchanged Groupings remain blocked, including direct save actions as well as form and button submission.
