---
"@brains/core": patch
"@rizom/brain": patch
"@rizom/ops": patch
---

Detect active durable jobs whose types are absent from the finalized execution inventory and report operational health as degraded. Add an exact, confirmation-gated operator recovery command that can terminally retire only known pre-scheduler projection jobs after atomically proving they have no attempt ownership or partial progress.
