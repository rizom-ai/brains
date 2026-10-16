---
"@brains/core": patch
"@brains/entity-service": patch
"@brains/recurring-checks": patch
---

Roll back recurring-check daemon/job registrations and entity embedding handlers when shell construction fails, while preserving normal shutdown order and exact-once cleanup.
