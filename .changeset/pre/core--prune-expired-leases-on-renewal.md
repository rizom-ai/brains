---
"@rizom/brain": patch
"@brains/entity-service": patch
---

A running brain removes leftover database leases. A brain removed expired lease rows only when it started, so a row left by a container killed while its lease was fresh outlived the next start and stayed until another one, and the offline asset commands kept finding a stale lease to refuse or skip. Each renewal of a brain's lease, every 10 seconds, now also deletes rows that have expired, other than its own, so such a row is gone within about one renewal of expiring. Fresh rows, including a maintenance command's, are left alone.
