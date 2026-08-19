---
"@rizom/brain": patch
---

Serialize projection coordination sweeps and keep live durable-root recovery read-only so periodic reconciliation does not contend with active import mutations under sustained load.

Delay lost-callback repair until terminal jobs have had a bounded settlement grace, distinguish legitimately long-lived durable roots from expired callback leases in operational health, and make the packaged soak prove complete process-tree cleanup without waiting forever on an affected Bun completion.
