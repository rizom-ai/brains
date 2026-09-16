---
"@brains/studio": minor
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/contracts": patch
"@brains/directory-sync": patch
---

Add Studio virtual-folder navigation, explicit folder/collection search, and folder-aware creation with server-encoded IDs and conditional writes. Preserve direct entity links, history, permissions, and ordinary singleton/capture flows.

Directory-sync supplies read-only destination previews and creates missing parent directories for nested notes without changing placement. No folder entities, ID rewrites, file moves, or database migrations are introduced.
