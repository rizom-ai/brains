---
"@rizom/brain": patch
"@brains/faq": patch
---

FAQ capture and reconcile jobs pass the job's abort signal to their model calls, so a job past its execution deadline stops instead of ignoring cancellation. Before, a slow model call held the worker past its grace period, the worker restarted itself, and three such restarts in an hour stopped the brain.
