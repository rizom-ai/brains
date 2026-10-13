---
"@brains/entity-service": patch
"@brains/plugins": patch
---

Add bounded, data-only named write admissions whose schemas and final authorization guards are registered on the database owner. Validate references before writer admission and run guards over serialized fields inside create/update transactions, including no-op export changes. Guard disposal and cancellation fail closed; arbitrary callbacks remain local-only. Keep entity test doubles aligned with admission policy.

Generation and Contact use this owner-side contract. Plugin contexts expose lifecycle-owned registration that revokes guards and drains admitted authorizers during teardown.
