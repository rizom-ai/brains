---
"@brains/directory-sync": patch
---

Detect unpushed commits against the explicit configured remote branch even when a legacy checkout has no upstream, and return Git checkpoints only when observed remote HEAD exactly matches local HEAD.
