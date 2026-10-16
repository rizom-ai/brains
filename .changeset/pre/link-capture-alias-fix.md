---
"@rizom/brain": patch
---

Register the stable `link-capture` handler alias in the link plugin so URL-based link capture jobs do not fail with `No handler registered for job type: link-capture`.

This keeps `system_create` generic while preserving the public `link-capture` workflow name used for link capture.
