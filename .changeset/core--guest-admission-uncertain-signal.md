---
"@rizom/brain": patch
---

Report guest execution reservations that are still active past their deadline. `GuestAdmission.cleanup()` returns the removed and uncertain counts, and guest maintenance raises the same operator alert for uncertain execution work that it already raises for uncertain credential writes, after committing its pruning pass. The reservation itself is never released: only the verified recovery procedure may do that, so abandoned turns no longer wedge concurrency or budget silently.
