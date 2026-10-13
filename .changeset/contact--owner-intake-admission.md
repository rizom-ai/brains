---
"@brains/contact": patch
"@brains/plugins": patch
---

Move Contact's final slot and expiry check to a named, data-only owner admission. Bind it to the actual restricted contact identity and create operation inside the entity transaction. Preserve uncertain reservations and reconcile lost acknowledgements by reading rather than repeating creates.

Expose lifecycle-owned write admission registration through plugin entity namespaces. Stop admission, revoke guards and drain active authorizers before plugin shutdown or failed-registration cleanup.
