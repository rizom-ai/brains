---
"@brains/recurring-checks": patch
"@rizom/brain": patch
---

Drain admitted recurring-check callbacks and alert deliveries after Effect interruption, before plugin or service teardown completes. Do not record cancelled checks as successful after their final alert delivery.
