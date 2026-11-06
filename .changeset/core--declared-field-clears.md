---
"@rizom/brain": patch
---

Clearing a cover or social card through `system_update` on a declared entity type now removes it from the record's metadata, and a clear the type would refill, such as one with a schema default, is refused instead of reported as done.
