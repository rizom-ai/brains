---
"@rizom/brain": patch
---

Keep large remote-deletion pulls convergent by returning when the Git command exits even if a detached descendant retains its output pipe, batching targeted delete jobs in groups of 50 while accepting existing single-delete jobs, and isolating the packaged import soak from external AI work.
