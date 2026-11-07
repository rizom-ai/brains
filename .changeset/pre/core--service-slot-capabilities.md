---
"@brains/plugins": patch
"@rizom/brain": patch
---

A service's capabilities belong to its slots, and a call's data to its handlers. The `jobs` slot is given `messaging` and `templates`, as `tools` is, and a job's handler is given only its `input`, `progress` and `signal`. The `subscriptions` slot is given `entities`, which inside an answer acts as the package's own grant, and an answer's handler is given only its `request` and the runtime-supplied `sender`.
