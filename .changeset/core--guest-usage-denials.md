---
"@rizom/brain": patch
---

The owner's guest usage record now keeps refused questions. An admission denial is recorded with its reason and the visitor's salted digest; the guest send route's own refusals (forbidden origin, wrong method or media type, invalid, oversized, unknown conversation, closed access) are recorded by category without their body or a visitor; and a full or unwritable record records its refusals too. Detailed denials have their own allowance, the guest policy's new required `usageRecord.maxDenialRecords` (presets: 1,000), so denial traffic never takes the places admitted questions need. Beyond it, denials become daily counts by reason, held in memory and written by the guest maintenance tick, so a flood of refused requests writes at most once a minute; counts that could not be written wait for the next tick.
