---
"@rizom/brain": patch
---

Identify the installed CLI by its runtime URL rather than its bundled source filename, avoiding an unnecessary self-reexecution. Route genuine local-install handoffs through the owned runner so signals reach the child and shutdown joins it. Keep the web database owner alive until the worker actually exits, then retire the Git broker after both roles exit, within the existing shutdown grace period.
