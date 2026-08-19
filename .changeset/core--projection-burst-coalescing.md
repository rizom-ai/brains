---
"@rizom/brain": patch
---

Coalesce explicit Directory Sync mutation batches into one durable projection wave, fence overlapping whole-corpus derives before atomic apply, recover abandoned callback and worker-owned boundaries, and expose bounded projection-batch diagnostics. Narrow service-plugin entity access so scheduler and durable-owner internals remain shell-owned.
