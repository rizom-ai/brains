---
"@brains/entity-service": patch
---

Preserve complete historical entity IDs in detail reads and revision snapshots, including embedded NUL characters and leading BOMs. Match the hierarchy query's byte-based ID decoding so opening and editing an entry cannot target its truncated ID. Stored IDs, filesystem placement, and database schemas are unchanged.
