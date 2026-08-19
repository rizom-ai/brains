---
"@rizom/brain": patch
---

Serialize projection coordination sweeps without recursive wakeup deadlocks, keep live durable-root recovery and blocked wave admission read-only, and distinguish expired callback leases from long-running durable roots under sustained import load.

Delay lost-callback repair until terminal jobs have had a bounded settlement grace, distinguish legitimately long-lived durable roots from expired callback leases in operational health, and make the packaged soak prove complete process-tree cleanup without waiting forever on an affected Bun completion.
