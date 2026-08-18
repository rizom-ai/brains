---
"@brains/directory-sync": patch
"@rizom/brain": patch
---

Close semantic Git broker recovery gaps found during affected-runtime acceptance.

Replacement generations now keep mutation admission closed until repository and durable
queue/checkpoint state are reconciled. Request IDs are bound to the exact checkout and
operation arguments, journal failures return correlated terminal errors, and app roles
proactively reconcile a lost owner without replaying ambiguous mutation intent.

Development, chat, startup-check, and supervised runtime paths all use a separate broker
process with complete process-group cleanup. The packaged broker now runs from a lightweight
entrypoint instead of loading a duplicate full Brain bundle, preserving the established RSS
envelope while retaining safe replacement and full-runtime fallback behavior.
