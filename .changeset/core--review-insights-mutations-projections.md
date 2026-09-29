---
"@rizom/brain": patch
"@brains/plugins": patch
"@brains/entity-service": patch
---

Bind service and entity insight reads to the caller's visibility, including typed reads and explicit scope requests. Reject operator create/edit requests whose nested entity identity does not match the authorized target before any read or write. Chunk projection target lookups within SQLite's variable limits while preserving batched prefetch and sequential write-intent semantics.
