---
"@rizom/ops": patch
---

Make deployed directory-sync gates hermetic by requiring embeddings and automatic topic extraction to be disabled, failing on observed external AI usage, and detecting watchdog-driven container restarts through the container start time even when Docker reports a zero restart count.
