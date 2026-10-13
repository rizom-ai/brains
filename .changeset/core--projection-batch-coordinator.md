---
"@brains/entity-service": patch
---

Separate projection-batch admission, fencing, recovery, and diagnostics from projection-wave persistence while preserving their shared serialized transaction boundary.
