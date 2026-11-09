---
"@rizom/brain": patch
---

A first-party create that queues a job for a record which already exists at another visibility now answers with a failed create naming both visibilities, as the entity plugin classes' interceptors did. Before, it threw. `system_create` already returned the same failure, but any other caller of the create got the thrown error.
