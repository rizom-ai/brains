---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/studio": patch
"@rizom/brain": patch
---

Add grouping usage reads with distinct entry totals and bounded, exact-value counts, including zero counts for unused values. One SQL statement applies admitted contributor types and visibility to every aggregate; duplicate and overlapping memberships do not inflate entry totals.

Expose the read through Studio's trusted-session API and typed client, retaining cancellation, source refresh and initializing/retry behavior. No durable state or content changes are introduced. Mounting usage data in the reviewed Groupings page and activating the replacement document source remain pending.
