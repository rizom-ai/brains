---
"@rizom/brain": patch
---

A generation that dies with its worker no longer leaves its entity stuck at "generating". When the job queue fails an expired attempt for good on reclaim, it now runs the handler's terminal error callback, which the queue skipped before; generation jobs use it to mark a still-generating placeholder failed. If `system_generate` cannot queue its job at all, it removes the placeholder it just created instead of leaving it behind.
