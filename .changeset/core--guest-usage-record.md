---
"@rizom/brain": patch
---

Guest chat now keeps an owner's record of what its public endpoint did. Each guest request takes a place in the record before admission is asked, so a full or unwritable record refuses the request (the existing `unavailable` response) instead of running work nobody can see, and spends no allowance. An admitted request is recorded as unresolved before any generation and records its outcome once; work that stops without one stays visibly unresolved. The record holds no credential, conversation locator or reply, and names a visitor only by a digest salted per deployment. Guest policies now carry a required `usageRecord` section with finite `maxRecords` and `retentionSeconds`; the built-in presets set both.
