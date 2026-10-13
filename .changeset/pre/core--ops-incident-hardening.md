---
"@rizom/ops": patch
---

Harden the two defects behind the rizom.ai deploy incident: user profileKind now validates against the runtime's registered profile kinds at parse time (with a lockstep test against @brains/profile) instead of failing at production boot, and forced image builds refuse to overwrite an existing registry tag unless the new Build overwrite input is explicitly confirmed. Tooling workflows (build/deploy/reconcile/upgrade) also reconcile to the template on init rerun; the operator-tuned directory-sync-stress workflow deliberately does not.
