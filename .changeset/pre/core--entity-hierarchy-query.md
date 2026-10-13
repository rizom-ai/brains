---
"@brains/entity-service": patch
"@brains/plugins": patch
---

Add a visibility-scoped hierarchy query to the existing entity-service client. Derive immediate folders and counts in SQLite, page direct entries independently, and keep stored IDs intact. Prefix queries use the existing ID index and the shared codec; no database migration is required.
