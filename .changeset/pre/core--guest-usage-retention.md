---
"@rizom/brain": patch
---

The owner's guest usage record now keeps to its own retention and reports its health. The guest maintenance tick removes records, denials and daily denial counts past the record's retention (a day's counts once the whole day is past it), without touching admission accounting or unresolved reservations, and deleting a conversation leaves its record in place, as the visitor notice says. Kept question text has a total bound, the guest policy's new required `usageRecord.maxStoredBytes` (presets: 4,000,000): a request whose largest possible question could exceed it is refused like one arriving at a full record. Operators see the record's bounded health as `guest-usage-record` — degraded while it is full and refusing questions, unhealthy while its writes fail — with counts only, never question text or storage errors.
